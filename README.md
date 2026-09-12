# Been-go!

**List it. It's been gone.**

An invite-only marketplace. Members list what they have, other members buy it,
and the money goes to the seller's bank account with a platform fee taken off
the top.

Same stack and conventions as [StreetRise](https://github.com/rodnrr/StreetRise),
different product.

**→ Setting it up for the first time? Follow [`PLAN.md`](PLAN.md).** It's the
step-by-step, account-by-account version of everything below.

## Stack

| Layer     | Tech                                    |
|-----------|-----------------------------------------|
| Frontend  | React 18 + TypeScript + Vite            |
| Styling   | Tailwind CSS v3                         |
| State     | Zustand + TanStack Query                |
| Database  | Supabase (Postgres + Auth + Storage)    |
| Payments  | Stripe Connect (Express) + Checkout     |
| Hosting   | Cloudflare Pages                        |
| CI        | GitHub Actions (typecheck + build)      |

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL + anon key
npm run dev
```

Other commands: `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run preview`, `npm run deploy`.

## How the three hard parts work

### The invite gate

Anyone can create an account; nobody can *do* anything with one. Signup writes a
`profiles` row at `status = 'pending_invite'`, and every RLS policy in the
database checks `is_member()` — which is `status = 'active'`, or a super admin.
The only way to flip that is `redeem_invite(code)`.

Three ways in, one gate behind all of them: email + password, Google, or a
6-digit code by SMS. Google and phone accounts land at `pending_invite` like
everyone else, so a provider is a way to *sign in*, never a way past the gate.
Both are dashboard settings rather than code — see Step 3b of `PLAN.md`.

That means the gate is not a screen someone can skip. A signed-in non-member who
bypasses the router still reads zero listings, because the fence is in Postgres.

Members get 3 invites each. Codes are single-use, expire in 30 days, and are
revocable. A code typed at signup is stashed on the device and redeemed the
moment a session exists, which is what lets a Google or phone signup — both of
which leave the page before any session exists — still arrive holding it.

### Who can do what

| Tier | Invite gate | Other members' rows | Admin flags |
|---|---|---|---|
| Member | needs a code | no | no |
| Admin | needs a code | activate, suspend, set invite allowance | no |
| Super admin | **exempt** | same | grant and revoke |

`/admin` is the screen for the last two: counters, a member directory, and a
link to every route in the app. The first super admin is made from the SQL
editor with `bootstrap_super_admin('you@example.com')` — that function is
revoked from both browser roles and refuses any caller holding a session, so it
cannot be reached from the app at all.

Everything the screen does goes through an RPC that re-checks `is_admin()`
server-side, and the admin RLS policies do the same. Hiding the nav link is
courtesy; the fence is in Postgres.

### Money

Stripe Connect Express with **destination charges**:

1. Seller onboards through Stripe — bank details go to Stripe, never here.
2. Buyer pays on Stripe's hosted checkout.
3. Stripe keeps its processing fee, sends your `application_fee_amount` to the
   platform, and transfers the rest to the seller.

The prices come from the database, not the browser. `create-checkout` accepts a
listing id — never an amount — and re-reads every cent server-side. An accepted
offer is honoured by id, and re-read the same way.

**Only the webhook may mark an order paid.** There is no INSERT policy on
`orders` for clients at all, and a trigger reverts any client write to the money
columns. A buyer cannot invent a paid order; a seller cannot edit a total.

### Photos

Uploaded to the `listing-photos` bucket under `{user_id}/{listing_id}/{uuid}`,
with a storage policy requiring that first path segment to be the uploader's own
id. Public read, because a listing photo is public the moment the listing is.

## Layout

```
src/
├── components/
│   ├── ui/           # Button, Card, Container, EmptyState… (one file)
│   ├── shared/       # RootLayout, RequireMember, ErrorBoundary, toasts
│   └── marketplace/  # ListingCard, PhotoUploader
├── pages/            # One file per route
├── lib/
│   ├── supabase.ts   # Client + Edge Function caller
│   ├── api.ts        # Every database call the UI makes
│   ├── auth.ts       # Session ↔ store wiring
│   ├── store.ts      # Zustand (auth, toasts)
│   └── format.ts     # Money in/out, timestamps
└── types/index.ts    # Shared types (hand-written, not generated)

supabase/
├── migrations/       # 001–004, run BY HAND in the SQL editor, in order
└── functions/        # connect-onboarding, create-checkout, stripe-webhook
```

## Migrations

Applied by hand in the Supabase SQL editor, in numeric order — same convention
as StreetRise. They are not run by the deploy pipeline.

| File | What it adds |
|---|---|
| `001_initial_schema.sql` | Tables, enums, signup trigger |
| `002_rls_policies.sql` | Every access rule + the column-protection triggers |
| `003_rpc_functions.sql` | Invites, offers, shipping, search |
| `004_storage_and_seed.sql` | Photo bucket + 12 categories |
| `005_admin_and_auth_providers.sql` | Super admin tier, admin RPCs, Google/phone profiles |

## Status

Working:

- [x] Invite-only signup, redemption, per-member invite allowance
- [x] Listings — create, edit, draft/publish, photos, soft delete
- [x] Browse — full-text search, category and price filters
- [x] Offers — make, withdraw, accept, decline, pay at the accepted price
- [x] Checkout — Stripe hosted, address collection, platform fee
- [x] Orders — purchases, sales, tracking, delivery confirmation
- [x] Seller payouts — Stripe Connect Express onboarding + dashboard
- [x] RLS on every table, with money columns server-owned
- [x] Sign in with Google, or with a code texted to your phone
- [x] Admin and super admin tiers, with an `/admin` screen for both

Fixed along the way: `redeem_invite()` never actually admitted anyone. The
column-protection trigger from `002` assumed a `SECURITY DEFINER` routine runs
with `auth.uid()` NULL — it does not; definer changes the role, never the JWT —
so the trigger reverted the one UPDATE that redemption exists to perform, and
did it silently. Migration `005` tests `current_user` instead, which is the
thing that actually differs between a browser write and a server write.

Not built on purpose (see the end of `PLAN.md` for why): buyer↔seller messaging,
timed auctions, in-app refunds, ratings, shipping labels, escrow.

Known gaps:

- [ ] **The fee percentage lives in two places** — `MARKETPLACE_FEE_BPS` (real)
      and `FEE_BPS` in `src/pages/SellPage.tsx` (the seller's estimate). Change
      both together.
- [ ] **The admin screen has no listing or order moderation.** An admin can
      suspend a *member*, which stops everything they do; taking down one bad
      listing while leaving the account alone is still a SQL update.
- [ ] **Offers never expire on their own.** The `expired` status exists but
      nothing sets it — it needs a scheduled job.
- [ ] **Quantity is decremented by the webhook only.** Two buyers can both reach
      checkout for the last item; the second one's payment succeeds and
      oversells. Fine at small scale, needs a reservation hold before it isn't.

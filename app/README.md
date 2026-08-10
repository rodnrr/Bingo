# RiseBay

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
cd app
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
database checks `is_member()` — which is `status = 'active'`. The only way to
flip that is `redeem_invite(code)`.

That means the gate is not a screen someone can skip. A signed-in non-member who
bypasses the router still reads zero listings, because the fence is in Postgres.

Members get 3 invites each. Codes are single-use, expire in 30 days, and are
revocable.

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
app/
├── src/
│   ├── components/
│   │   ├── ui/           # Button, Card, Container, EmptyState… (one file)
│   │   ├── shared/       # RootLayout, RequireMember, ErrorBoundary, toasts
│   │   └── marketplace/  # ListingCard, PhotoUploader
│   ├── pages/            # One file per route
│   ├── lib/
│   │   ├── supabase.ts   # Client + Edge Function caller
│   │   ├── api.ts        # Every database call the UI makes
│   │   ├── auth.ts       # Session ↔ store wiring
│   │   ├── store.ts      # Zustand (auth, toasts)
│   │   └── format.ts     # Money in/out, timestamps
│   └── types/index.ts    # Shared types (hand-written, not generated)
└── supabase/
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

Not built on purpose (see the end of `PLAN.md` for why): buyer↔seller messaging,
timed auctions, in-app refunds, ratings, shipping labels, escrow.

Known gaps:

- [ ] **The fee percentage lives in two places** — `MARKETPLACE_FEE_BPS` (real)
      and `FEE_BPS` in `src/pages/SellPage.tsx` (the seller's estimate). Change
      both together.
- [ ] **No admin UI.** Suspending a member or toping up invites is a SQL update;
      the `is_admin` flag and policies exist, the screens do not.
- [ ] **Offers never expire on their own.** The `expired` status exists but
      nothing sets it — it needs a scheduled job.
- [ ] **Quantity is decremented by the webhook only.** Two buyers can both reach
      checkout for the last item; the second one's payment succeeds and
      oversells. Fine at small scale, needs a reservation hold before it isn't.

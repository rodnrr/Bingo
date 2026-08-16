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

### Not overselling the last item

Stock is decremented when checkout **opens**, not when payment lands. The
decrement is a single conditional `UPDATE ... WHERE quantity >= n`, which
Postgres evaluates while holding the row lock — so of two buyers racing for the
last item, exactly one gets a Stripe session and the other is told it is gone.

That means every `pending_payment` order is holding stock, and three separate
paths give it back: the buyer cancelling, Stripe's session-expired webhook, and
`release_stale_reservations()` for anything that falls through both.

### Agreements

Terms, Privacy, and Community Rules live in `src/legal/*.md` and are bundled
into the app, so they render for signed-out visitors and when the database is
unreachable. Acceptance is recorded in `terms_acceptances` — one row per member
per version, append-only, with no UPDATE or DELETE policy for anyone including
admins. Listing, offering, and buying all require the current version in RLS.

**The documents are unreviewed drafts with placeholders in them.** Read
`src/legal/README.md` before launch.

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
| `005_settings_and_terms.sql` | One-row settings (the fee), append-only terms acceptance, price ceilings |
| `006_inventory_reservation.sql` | Stock held at checkout instead of after payment |
| `007_offer_expiry.sql` | Offer deadlines, enforced at use and swept in the background |
| `008_moderation_and_safety.sql` | Reports, suspension with teeth, admin actions + audit log |
| `009_fix_trusted_writes.sql` | Lets the trusted RPCs write the columns they own — see below |
| `010_lock_internal_functions.sql` | Stops PostgREST exposing the internal helpers as public RPCs |

All ten are **applied** to the live project (`kktiqfvxoljvnxmrclyq`).

### Testing them before they touch anything

```bash
sudo ./supabase/tests/run.sh
```

Applies every migration to a scratch local Postgres (Supabase's `auth` and
`storage` objects are stubbed) and exercises the flows that would cost real
money if they were wrong: the oversell race, invite accounting, offer
deadlines, privilege escalation, and money-column tampering.

It is not a substitute for testing on Supabase — RLS is only proved to parse
here, not to hold against a real JWT. But it earned its keep immediately:
**it caught three shipped bugs**, one of which meant nobody could join at all.
`protect_profile_columns()` was reverting the writes made by the very
SECURITY DEFINER functions meant to be the only way those columns change,
because `SECURITY DEFINER` changes the executing role but not `auth.uid()`.
Migration 009 fixes it and repairs any rows the bug stranded.

Supabase's own security advisor then caught a fourth, which the local harness
structurally could not: PostgREST publishes every `public` function as an RPC,
and Postgres grants EXECUTE to PUBLIC by default — so helpers written to be
called by other functions were also a public API. Any signed-in member could
have called `release_listing_stock` to inflate anyone's inventory, or
`log_admin_action` to forge the append-only audit log. Migration 010 revokes
those grants and hands them back to `service_role` alone.

**Run `get_advisors` after any schema change.** The lesson generalises: a
local harness proves logic, an advisor against the real platform proves
exposure, and neither substitutes for the other.

## Status

Working:

- [x] Invite-only signup, redemption, per-member invite allowance
- [x] Listings — create, edit, draft/publish, photos, soft delete
- [x] Browse — full-text search, category and price filters
- [x] Offers — make, withdraw, accept, decline, pay at the accepted price
- [x] Offer deadlines — 7 days to respond, 48 hours to pay once accepted
- [x] Checkout — Stripe hosted, address collection, platform fee
- [x] Stock reservation — held at checkout, released on abandon (no overselling)
- [x] Orders — purchases, sales, tracking, delivery confirmation
- [x] Seller payouts — Stripe Connect Express onboarding + dashboard
- [x] Terms of Service, Privacy Policy, Community Rules + recorded acceptance
- [x] Reporting — members report listings, admins triage them
- [x] Admin console — members, suspensions, invites, reports, fee, audit log
- [x] RLS on every table, with money columns server-owned

Not built on purpose (see the end of `PLAN.md` for why): buyer↔seller messaging,
timed auctions, in-app refunds, ratings, shipping labels, escrow.

Known gaps:

- [ ] **The legal documents are unreviewed drafts.** They have placeholders in
      them and no lawyer has read them. See `src/legal/README.md` before launch —
      this is the one item on this list that can actually hurt you.
- [ ] **No email is ever sent.** No order confirmations, no "your offer was
      accepted", no invite emails — members only find out by opening the app.
      Wiring an Edge Function to Resend or Postmark is the next obvious build.
- [ ] **Sweepers need pg_cron.** `release_stale_reservations()` and
      `expire_stale_offers()` are scheduled only if the extension is enabled
      (Supabase → Database → Extensions), otherwise they are manual. Both are
      cleanup only: every deadline they enforce is independently re-checked at
      the point of use, so a sweeper that never runs costs tidiness, not
      correctness.
- [ ] **Deleting an auth user fails if they have orders.** `orders` restricts the
      delete on purpose, to match the 7-year retention in the privacy policy.
      Suspend instead, or delete the orders first if you genuinely mean to.
- [ ] **Report handling has no appeals path.** An actioned report is final and
      the member is not notified. Fine at small scale, not fine at large.

## Looking at the design without a database

```bash
npm run dev
# → http://localhost:5173/preview
```

`/preview` mounts the real components with invented data, so the screens behind
the invite gate — the browse grid, listing detail, the seller's fee breakdown,
the admin console — can be worked on offline. It exists only in development:
`import.meta.env.DEV` is folded to `false` at build time, so Rollup drops the
import and no chunk reaches production. (Guarding only the `<Route>` is not
enough — the import expression alone keeps the chunk alive. Verified by
grepping `dist/`.)

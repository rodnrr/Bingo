# Been-go! — the plan, step by step

The code is written. What's left is wiring it to real accounts. Nothing below
needs a developer — it's account signups, copy-paste, and clicking through
dashboards. Do the steps in order; each one is checkable before you move on.

**Total time to a live, working marketplace: about 3 hours.**
**Total cost to start: $0/month + Stripe's per-sale cut.**

---

## Step 0 — What you're building

An invite-only eBay. Members list things, other members buy them, money goes
straight to the seller's bank account, and you keep a percentage of every sale.

| Piece | What it does | Who provides it |
|---|---|---|
| The website | Browse, list, offer, buy | This repo, hosted on Cloudflare |
| The database | Members, listings, orders | Supabase (free tier) |
| The money | Checkout, payouts, your cut | Stripe |
| The door | Invite codes | Built in — no extra service |

You never touch anyone's card or bank number. Stripe holds all of it. That's
deliberate: it keeps you out of PCI compliance entirely.

---

## Step 1 — Supabase project (20 min)

1. Sign up at [supabase.com](https://supabase.com) → **New project**.
   - Name: `beengo`
   - Region: closest to your buyers
   - Save the database password somewhere safe.
2. Wait for it to finish provisioning (~2 min).
3. Go to **Database → Extensions** and enable **`pg_cron`**. Do this *before*
   the migrations: with it on, the background cleanup jobs schedule themselves.
   Without it they still work, you just have to run them by hand.

4. Go to **SQL Editor** → **New query**. Open the migration files in
   `supabase/migrations/` and run them **in numeric order**, one at a time:
   - `001_initial_schema.sql` — tables
   - `002_rls_policies.sql` — the security rules
   - `003_rpc_functions.sql` — invites, offers, shipping
   - `004_storage_and_seed.sql` — photo storage + categories
   - `005_settings_and_terms.sql` — platform settings + terms acceptance
   - `006_inventory_reservation.sql` — stock held at checkout
   - `007_offer_expiry.sql` — offer deadlines
   - `008_moderation_and_safety.sql` — reports, suspensions, admin actions

   Each should say "Success. No rows returned." If one errors, stop and fix it
   before running the next — they build on each other.

5. Set your support email, which appears in the legal documents and to members:

   ```sql
   UPDATE platform_settings SET support_email = 'you@yourdomain.com';
   ```

6. Go to **Project Settings → API** and copy two values:
   - Project URL
   - `anon` / `public` key

**Check it worked:** Table Editor should show `profiles`, `listings`, `orders`,
`invites`, `offers`, `reports`, `platform_settings`, `terms_acceptances`;
`categories` should have 12 rows and `platform_settings` exactly 1.

---

## Step 2 — Run it on your own machine (15 min)

```bash
npm install
cp .env.example .env.local
```

Open `.env.local` and paste in the two Supabase values from Step 1. Then:

```bash
npm run dev
```

Open http://localhost:5173. You should see the Been-go! landing page.

**Check it worked:** Create an account at `/signup` (any invite code — it will
fail, that's expected). Then in Supabase → Table Editor → `profiles`, you should
see your row with `status = pending_invite`.

---

## Step 3 — Let yourself in (5 min)

Nobody has an invite yet, so bootstrap the first member by hand. In the Supabase
SQL Editor, using the email you just signed up with:

```sql
UPDATE profiles
   SET status = 'active',
       is_admin = TRUE,
       invites_remaining = 50
 WHERE id = (SELECT id FROM auth.users WHERE email = 'you@example.com');
```

Refresh the browser. You'll be asked to read and accept the terms — do it, the
same as any member will. Then you're in, you're the admin, and you have 50
invites.

**Check it worked:** `/browse` loads, `/invites` lets you create a code, and an
**Admin** link appears in the header.

---

## Step 4 — Stripe (45 min — the longest step)

This is what makes it a real marketplace instead of a catalogue.

### 4a. Account

1. Sign up at [stripe.com](https://stripe.com). Use **test mode** for now (the
   toggle in the top right).
2. **Connect → Get started** → choose **Platform or marketplace**.
3. In **Connect → Settings**, set your platform name and support email. These
   appear on the screens your sellers see.

### 4b. Keys

From **Developers → API keys**, copy the **Secret key** (`sk_test_...`).

### 4c. Deploy the payment functions

Install the Supabase CLI, then:

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF     # from your Supabase URL

# Secrets — these live on the server, never in the app bundle
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set APP_URL=http://localhost:5173

# Note: your platform fee is NOT set here. It lives in the database
# (platform_settings.fee_bps) so the percentage sellers are shown and the
# percentage you charge are the same number. Change it at /admin → Settings.

supabase functions deploy connect-onboarding
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
```

> The `--no-verify-jwt` on the webhook is required. Stripe doesn't send Supabase
> auth headers; the function verifies Stripe's own signature instead.

### 4d. Webhook

1. Stripe → **Developers → Webhooks → Add endpoint**.
2. URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
3. Events to send:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `charge.refunded`
   - `account.updated`
4. Copy the **Signing secret** (`whsec_...`) and:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase functions deploy stripe-webhook --no-verify-jwt
```

**Check it worked:** In the app, go to `/account` → **Set up payouts**. Stripe's
onboarding should open. In test mode you can fill it with their test data
(`000-000-0000`, SSN `000-00-0000`, routing `110000000`, account `000123456789`).
When you come back, the page should say **Payouts are active**.

---

## Step 5 — Your first end-to-end sale (20 min)

Do this before you invite anyone. It's the only way to know the whole chain works.

1. As yourself, create a listing at `/sell`, add a photo, publish it.
2. Open a **private/incognito window**, sign up as a second account using an
   invite code you generate at `/invites`.
3. As that second account, buy the listing. Use Stripe's test card:
   `4242 4242 4242 4242`, any future expiry, any CVC.
4. You should land on the confirmation page.

**Check it worked, all four:**
- Buyer sees the order under `/purchases`
- Seller sees it under `/sales`, **with the shipping address**
- Supabase → `orders` shows `status = paid`
- Stripe → **Payments** shows the charge, and your application fee under
  **Connect → Application fees**

If the order is stuck on `pending_payment`, the webhook isn't firing — check
Stripe → Webhooks → your endpoint for the failed delivery and its error.

---

## Step 6 — Put it on the internet (30 min)

1. In Cloudflare (your **PocketRocket** account works fine — the account name
   has nothing to do with the project name) → **Workers & Pages** →
   **Create → Pages → Connect to Git** → pick this repo.
2. Build settings:
   - Root directory: leave blank
   - Build command: `npm run build`
   - Output directory: `dist`
   - Project name: `beengo` — this becomes `beengo.pages.dev`
3. Environment variables: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Deploy. You get a `beengo-xyz.pages.dev` URL.
5. Point the new URL back at the rest of the stack:
   ```bash
   supabase secrets set APP_URL=https://your-real-url
   supabase functions deploy connect-onboarding
   supabase functions deploy create-checkout
   ```
6. Supabase → **Authentication → URL Configuration**: set Site URL to your real
   URL and add `https://your-url/auth/callback` to Redirect URLs. Skipping this
   is the single most common reason signup emails appear broken.

**Check it worked:** Run through Step 5 again on the live URL.

---

## ⚠️ Before real money: the legal bit (30 min + a lawyer)

Been-go! ships with a Terms of Service, a Privacy Policy, and Community Rules
including a prohibited-items list. Members must read and accept them before they
can list, offer, or buy, and every acceptance is recorded permanently.

They are **drafts with placeholders in them, and no lawyer has read them.**

1. Read `src/legal/README.md`. It lists every placeholder and which sections
   most need real legal input.
2. Fill in every `[BRACKETED]` value in `src/legal/terms.md`,
   `src/legal/privacy.md`, and `src/legal/rules.md`. Check none are left:

   ```bash
   grep -n '\[' src/legal/*.md
   ```

3. Have a lawyer in your jurisdiction read them. For a marketplace this size
   that is usually a one-off review, and it is far cheaper than the first
   dispute you have to handle without it.
4. Ask that lawyer two things beyond the documents:
   - Should you form an LLC or equivalent before taking other people's money?
     (That entity is what separates the marketplace's liabilities from your
     personal ones.)
   - Do you need to collect or report sales tax anywhere you operate?

The app does not check any of this. It will happily render `[SUPPORT EMAIL]` to
a real member. This step is entirely on you.

**Check it worked:** visit `/legal/terms` on your deployed site and read it as a
stranger would. No brackets, correct entity name, an email that reaches you.

---

## Step 7 — Go live with real money (20 min)

Only after Step 6 works end to end in test mode.

1. Stripe: complete **Activate your account** (business details, your own bank).
2. Flip Stripe to **live mode**, get the live secret key and create the webhook
   again against the same URL — live mode has its own separate webhook secret.
3. ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...      # the LIVE one
   supabase functions deploy create-checkout
   supabase functions deploy connect-onboarding
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
4. Buy something cheap from yourself with a real card. Refund it afterwards from
   the Stripe dashboard. Costs you a few cents in fees and proves the real chain.

---

## Step 8 — Open the doors (ongoing)

Invite people from `/invites`. Each member gets 3 invites of their own, so the
network grows by vouching rather than by advertising. That's the whole point of
the door policy: everyone here can be traced back to someone who took a chance
on them.

Everything you need to run it day to day is at **/admin**:

| Tab | What it does |
|---|---|
| **Overview** | Members, live listings, open reports, total sold, your fees |
| **Members** | Suspend, reinstate, top up someone's invites |
| **Reports** | Triage what members flag — remove a listing, action, or dismiss |
| **Settings** | Change your fee, see the append-only log of every admin action |

Suspending a member takes their listings down immediately and blocks new
checkouts against them — not just the buttons, the data. The rules are in the
database, not the browser.

Orders they have already been paid for stay their responsibility to ship, which
is why suspension is not the same as deletion.

---

## What it costs you

| | Free until |
|---|---|
| Supabase | 500 MB database, 1 GB files, 50k monthly users |
| Cloudflare Pages | 500 builds/month, unlimited bandwidth |
| Stripe | No monthly fee — 2.9% + 30¢ per sale, plus 0.25% for Connect payouts |

So: **$0/month until you have real volume.** Stripe's cut comes out of each
sale, and your 8% platform fee comes out on top of that, into your account.

To change your cut: **/admin → Settings → Platform fee**. It takes effect on the
next checkout, and the seller's estimate on the listing form updates with it —
both read the same row, so they cannot drift apart.

---

## One loose end: the repo is still called "Bingo"

The app is Been-go! everywhere now, but the GitHub repository itself is still
named `Bingo` — that's a setting only you can change, and it takes ten seconds:

**GitHub → the repo → Settings → General → Repository name → `Beengo` → Rename.**

GitHub redirects the old URL automatically, so nothing breaks. Your local clone
keeps working too, but you can point it at the new name with:

```bash
git remote set-url origin https://github.com/rodnrr/Beengo
```

Do this before connecting Cloudflare in Step 6, and you'll never see the old
name again.

---

## Deliberately not built

Named so you can decide, rather than discovering them later:

- **Buyer/seller messaging.** Offers carry a note; there's no chat thread.
- **Auctions with live bidding.** This is Buy It Now plus Make An Offer. Real
  timed auctions need bid scheduling and anti-sniping, which is its own project.
- **Refunds from inside the app.** Issue them from the Stripe dashboard; the
  webhook already listens for `charge.refunded` and updates the order.
- **Ratings and reviews.** The invite tree is the trust mechanism for now.
- **Shipping labels.** Sellers ship it themselves and paste a tracking number.
- **Disputes/escrow.** Stripe handles chargebacks against the seller's account.
  If you want to hold funds before releasing them, that's a separate design.

## The one thing to be careful about

`SUPABASE_SERVICE_ROLE_KEY` and `STRIPE_SECRET_KEY` bypass every rule in this
system. They belong only in `supabase secrets set`, never in `.env.local`, never
with a `VITE_` prefix, never in a commit. Anything named `VITE_*` gets compiled
into the JavaScript every visitor downloads.

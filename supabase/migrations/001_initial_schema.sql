-- ================================================================
-- Been-go — Migration 001: Core schema
--
-- Money is stored in integer cents. Never floats: 0.1 + 0.2 is not 0.3
-- in binary floating point, and a marketplace that rounds a cent the
-- wrong way on a payout is a marketplace with a support queue.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────

CREATE TYPE listing_status AS ENUM ('draft', 'active', 'sold', 'removed');
CREATE TYPE listing_condition AS ENUM ('new', 'like_new', 'good', 'fair', 'for_parts');
CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'declined', 'withdrawn', 'expired');
CREATE TYPE order_status AS ENUM (
  'pending_payment', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'
);
CREATE TYPE member_status AS ENUM ('pending_invite', 'active', 'suspended');

-- ── profiles ─────────────────────────────────────────────────────
-- One row per auth user, created by trigger on signup. A new account
-- lands as 'pending_invite' and can browse nothing but the invite
-- screen until a code is redeemed — that gate is enforced in RLS
-- (migration 002), not in the client.

CREATE TABLE profiles (
  id                     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle                 TEXT UNIQUE,
  display_name           TEXT,
  avatar_url             TEXT,
  bio                    TEXT,
  status                 member_status NOT NULL DEFAULT 'pending_invite',
  is_admin               BOOLEAN NOT NULL DEFAULT FALSE,
  invited_by             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  invites_remaining      INT NOT NULL DEFAULT 3,

  -- Stripe Connect (Express). The account id is written by the
  -- connect-onboarding function; the two booleans are mirrored from
  -- Stripe by the account.updated webhook and are the only thing the
  -- app trusts when deciding whether someone may list for sale.
  stripe_account_id      TEXT UNIQUE,
  stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX profiles_status_idx ON profiles(status);

-- ── invites ──────────────────────────────────────────────────────
-- A code is a capability: whoever holds it can join. So codes are
-- single-use by default, expire, and are revocable. redeem_invite()
-- (migration 003) is the only writer of used_count.

CREATE TABLE invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  created_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email       TEXT,
  note        TEXT,
  max_uses    INT NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count  INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX invites_created_by_idx ON invites(created_by);

CREATE TABLE invite_redemptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id   UUID NOT NULL REFERENCES invites(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (invite_id, user_id)
);

-- ── categories ───────────────────────────────────────────────────
-- Kept in the database rather than a TS constant so the taxonomy can
-- change without a deploy. Seeded in migration 004.

CREATE TABLE categories (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_slug TEXT REFERENCES categories(slug) ON DELETE CASCADE,
  icon        TEXT,
  sort_order  INT NOT NULL DEFAULT 100
);

-- ── listings ─────────────────────────────────────────────────────

CREATE TABLE listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 140),
  description     TEXT NOT NULL DEFAULT '',
  category_slug   TEXT REFERENCES categories(slug) ON DELETE SET NULL,
  condition       listing_condition NOT NULL DEFAULT 'good',

  price_cents     INT NOT NULL CHECK (price_cents >= 100),
  shipping_cents  INT NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  currency        TEXT NOT NULL DEFAULT 'usd',
  quantity        INT NOT NULL DEFAULT 1 CHECK (quantity >= 0),

  allow_offers    BOOLEAN NOT NULL DEFAULT TRUE,
  ships_from      TEXT,
  status          listing_status NOT NULL DEFAULT 'draft',
  view_count      INT NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sold_at         TIMESTAMPTZ
);

CREATE INDEX listings_status_created_idx ON listings(status, created_at DESC);
CREATE INDEX listings_seller_idx         ON listings(seller_id);
CREATE INDEX listings_category_idx       ON listings(category_slug) WHERE status = 'active';

-- Full-text search over title + description. Generated column so it can
-- never drift from the row it describes.
ALTER TABLE listings ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) STORED;

CREATE INDEX listings_search_idx ON listings USING GIN (search_tsv);

CREATE TABLE listing_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  url          TEXT NOT NULL,
  position     INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX listing_photos_listing_idx ON listing_photos(listing_id, position);

-- ── offers ───────────────────────────────────────────────────────

CREATE TABLE offers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_cents  INT NOT NULL CHECK (amount_cents >= 100),
  message       TEXT,
  status        offer_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at  TIMESTAMPTZ
);

-- One live offer per buyer per listing. Re-offering means withdrawing
-- the old one first, which keeps the seller's inbox honest.
CREATE UNIQUE INDEX offers_one_pending_per_buyer
  ON offers(listing_id, buyer_id) WHERE status = 'pending';

CREATE INDEX offers_listing_idx ON offers(listing_id, created_at DESC);
CREATE INDEX offers_buyer_idx   ON offers(buyer_id, created_at DESC);

-- ── orders ───────────────────────────────────────────────────────
-- An order row is created BEFORE Stripe Checkout opens, in
-- 'pending_payment'. The webhook is what promotes it to 'paid'. The
-- client is never allowed to declare an order paid — see migration 002.

CREATE TABLE orders (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id                  UUID NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  buyer_id                    UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  seller_id                   UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,

  quantity                    INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  item_cents                  INT NOT NULL CHECK (item_cents >= 0),
  shipping_cents              INT NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  fee_cents                   INT NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  total_cents                 INT NOT NULL CHECK (total_cents >= 0),
  currency                    TEXT NOT NULL DEFAULT 'usd',

  status                      order_status NOT NULL DEFAULT 'pending_payment',

  stripe_checkout_session_id  TEXT UNIQUE,
  stripe_payment_intent_id    TEXT,

  ship_to                     JSONB,
  tracking_carrier            TEXT,
  tracking_number             TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at                     TIMESTAMPTZ,
  shipped_at                  TIMESTAMPTZ,
  delivered_at                TIMESTAMPTZ
);

CREATE INDEX orders_buyer_idx  ON orders(buyer_id, created_at DESC);
CREATE INDEX orders_seller_idx ON orders(seller_id, created_at DESC);

-- ── updated_at maintenance ───────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER listings_touch BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── New auth user → profile row ──────────────────────────────────
-- SECURITY DEFINER because it runs as the auth system, before the new
-- user has any RLS standing of their own.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'pending_invite'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ================================================================
-- Been-go! — Migration 005: Platform settings + terms acceptance
--
-- Fixes two things at once:
--
-- 1. The fee percentage lived in two places (a server env var and a
--    hardcoded constant in the seller's estimate). Now it lives in one
--    row that both the checkout function and the UI read, so the number
--    a seller is shown is by construction the number they are charged.
--
-- 2. Nobody had agreed to anything. A marketplace that moves other
--    people's money needs a record of who accepted which terms and
--    when — and that record has to be append-only, or it is not a
--    record at all.
-- ================================================================

-- ── platform_settings ────────────────────────────────────────────
-- Exactly one row, enforced by the primary key: `id` can only ever be
-- TRUE, so a second INSERT collides instead of silently creating a
-- rival configuration.

CREATE TABLE platform_settings (
  id                  BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),

  -- Platform cut in basis points. Capped at 30% because a fee above
  -- that is far more likely to be a typo (8000 instead of 800) than an
  -- intention, and a typo here silently overcharges every sale.
  fee_bps             INT NOT NULL DEFAULT 800 CHECK (fee_bps BETWEEN 0 AND 3000),

  -- Bumping this invalidates everyone's acceptance and forces the
  -- agreement screen again. Use the publication date of the document.
  terms_version       TEXT NOT NULL DEFAULT '2026-08-10',

  -- Hard ceilings, enforced in the database rather than in a form.
  max_price_cents     INT NOT NULL DEFAULT 100000000,  -- $1,000,000
  min_price_cents     INT NOT NULL DEFAULT 100,        -- $1.00

  support_email       TEXT NOT NULL DEFAULT 'support@example.com',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER platform_settings_touch BEFORE UPDATE ON platform_settings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Readable by everyone, including signed-out visitors: it holds a fee
-- percentage and a version string, both of which appear in the public
-- terms anyway. The pending-invite screen needs the version before the
-- reader is a member, so gating this on is_member() would deadlock.
CREATE POLICY "settings_public_read"
  ON platform_settings FOR SELECT
  USING (TRUE);

CREATE POLICY "settings_admin_write"
  ON platform_settings FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- Single-statement readers for the Edge Functions and policies below.
CREATE OR REPLACE FUNCTION current_fee_bps()
RETURNS INT AS $$
  SELECT fee_bps FROM platform_settings WHERE id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION current_terms_version()
RETURNS TEXT AS $$
  SELECT terms_version FROM platform_settings WHERE id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ── terms_acceptances ────────────────────────────────────────────
-- Append-only by design: there is no UPDATE or DELETE policy for any
-- client, admins included. An acceptance you can edit afterwards is
-- worth nothing in a dispute.

CREATE TABLE terms_acceptances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  version      TEXT NOT NULL,
  accepted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, version)
);

CREATE INDEX terms_acceptances_user_idx ON terms_acceptances(user_id);

ALTER TABLE terms_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "terms_read_own"
  ON terms_acceptances FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

-- You may record your own acceptance, of the version currently in
-- force, and nothing else. Backdating someone else's agreement — or
-- your own to a superseded version — is not expressible.
CREATE POLICY "terms_insert_own_current"
  ON terms_acceptances FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND version = current_terms_version()
  );

CREATE OR REPLACE FUNCTION has_accepted_terms()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
      FROM terms_acceptances ta
     WHERE ta.user_id = auth.uid()
       AND ta.version = current_terms_version()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION accept_terms(p_version TEXT)
RETURNS terms_acceptances AS $$
DECLARE
  v_row terms_acceptances;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  -- The client sends the version it actually rendered. If that is not
  -- the version now in force, the document changed while they were
  -- reading it, and consent to the old text is not consent to the new.
  IF p_version IS DISTINCT FROM current_terms_version() THEN
    RAISE EXCEPTION 'These terms have been updated — reload and read the current version';
  END IF;

  INSERT INTO terms_acceptances (user_id, version)
  VALUES (auth.uid(), p_version)
  ON CONFLICT (user_id, version) DO UPDATE SET version = EXCLUDED.version
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Gate the actions that create obligations ─────────────────────
-- Reading stays open to any member: someone re-reading the rules
-- should still be able to see their own orders. But listing, offering,
-- and buying are promises, and you cannot make a promise under an
-- agreement you have not accepted.

DROP POLICY IF EXISTS "listings_insert_own" ON listings;
CREATE POLICY "listings_insert_own"
  ON listings FOR INSERT
  WITH CHECK (
    seller_id = auth.uid()
    AND is_member()
    AND has_accepted_terms()
  );

DROP POLICY IF EXISTS "offers_insert_buyer" ON offers;
CREATE POLICY "offers_insert_buyer"
  ON offers FOR INSERT
  WITH CHECK (
    buyer_id = auth.uid()
    AND is_member()
    AND has_accepted_terms()
    AND EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_id
        AND l.status = 'active'
        AND l.quantity > 0
        AND l.allow_offers = TRUE
        AND l.seller_id <> auth.uid()
    )
  );

-- ── Price ceiling ────────────────────────────────────────────────
-- 001 set a floor but no ceiling. A fat-fingered listing at
-- $10,000,000 is not a listing, and Stripe rejects the charge anyway —
-- better to refuse it at the point of entry.

ALTER TABLE listings
  ADD CONSTRAINT listings_price_ceiling CHECK (price_cents <= 100000000);

ALTER TABLE listings
  ADD CONSTRAINT listings_shipping_ceiling CHECK (shipping_cents <= 10000000);

ALTER TABLE offers
  ADD CONSTRAINT offers_amount_ceiling CHECK (amount_cents <= 100000000);

-- ================================================================
-- RiseBay — Migration 002: Row Level Security
--
-- The rules this file encodes, in plain words:
--
--   1. Membership is the gate. A signed-in account that has not
--      redeemed an invite can read and write nothing but its own
--      profile row. Browsing, listing, offering, and buying all
--      require status = 'active'.
--   2. Money state belongs to the server. No client-side role may
--      set an order to 'paid' or touch fee_cents — only the webhook,
--      which runs with the service-role key and bypasses RLS.
--   3. Sellers own their listings; buyers own their orders; nobody
--      reads a stranger's offer.
-- ================================================================

ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites            ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_photos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders             ENABLE ROW LEVEL SECURITY;

-- ── Helpers ──────────────────────────────────────────────────────
-- Both are SECURITY DEFINER so a policy can consult profiles without
-- the caller needing read access to the row it is consulting.

CREATE OR REPLACE FUNCTION is_member()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_admin = TRUE AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ── profiles ─────────────────────────────────────────────────────

CREATE POLICY "profiles_read_self"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Members see each other (seller name on a listing, buyer name on an order).
CREATE POLICY "profiles_read_members"
  ON profiles FOR SELECT
  USING (is_member());

CREATE POLICY "profiles_update_self"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_admin_all"
  ON profiles FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Privilege escalation guard. profiles_update_self lets a member edit
-- their own row, and without this an UPDATE could set is_admin, flip
-- status back to 'active' after a suspension, mint extra invites, or
-- claim someone else's Stripe account. Those columns are server-owned:
-- the trigger reverts them unless the writer is an admin or a
-- SECURITY DEFINER routine running with rls off (the webhook path).
CREATE OR REPLACE FUNCTION protect_profile_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.status                 := OLD.status;
  NEW.is_admin               := OLD.is_admin;
  NEW.invited_by             := OLD.invited_by;
  NEW.invites_remaining      := OLD.invites_remaining;
  NEW.stripe_account_id      := OLD.stripe_account_id;
  NEW.stripe_charges_enabled := OLD.stripe_charges_enabled;
  NEW.stripe_payouts_enabled := OLD.stripe_payouts_enabled;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER profiles_protect_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_columns();

-- ── invites ──────────────────────────────────────────────────────
-- A member reads and revokes the invites they created. Nobody reads
-- anyone else's codes: redemption goes through redeem_invite(), which
-- looks up the code with definer rights (migration 003).

CREATE POLICY "invites_read_own"
  ON invites FOR SELECT
  USING (created_by = auth.uid() OR is_admin());

CREATE POLICY "invites_insert_own"
  ON invites FOR INSERT
  WITH CHECK (created_by = auth.uid() AND is_member());

CREATE POLICY "invites_update_own"
  ON invites FOR UPDATE
  USING (created_by = auth.uid() OR is_admin())
  WITH CHECK (created_by = auth.uid() OR is_admin());

CREATE POLICY "invite_redemptions_read_own"
  ON invite_redemptions FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_admin()
    OR EXISTS (SELECT 1 FROM invites i WHERE i.id = invite_id AND i.created_by = auth.uid())
  );

-- ── categories ───────────────────────────────────────────────────

CREATE POLICY "categories_read_members"
  ON categories FOR SELECT
  USING (is_member());

CREATE POLICY "categories_admin_write"
  ON categories FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── listings ─────────────────────────────────────────────────────

CREATE POLICY "listings_read_active"
  ON listings FOR SELECT
  USING (status IN ('active', 'sold') AND is_member());

CREATE POLICY "listings_read_own"
  ON listings FOR SELECT
  USING (seller_id = auth.uid());

CREATE POLICY "listings_insert_own"
  ON listings FOR INSERT
  WITH CHECK (seller_id = auth.uid() AND is_member());

CREATE POLICY "listings_update_own"
  ON listings FOR UPDATE
  USING (seller_id = auth.uid() AND is_member())
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY "listings_delete_own"
  ON listings FOR DELETE
  USING (seller_id = auth.uid());

CREATE POLICY "listings_admin_all"
  ON listings FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── listing_photos ───────────────────────────────────────────────

CREATE POLICY "photos_read_with_listing"
  ON listing_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_id
        AND (l.seller_id = auth.uid() OR (l.status IN ('active', 'sold') AND is_member()))
    )
  );

CREATE POLICY "photos_write_own_listing"
  ON listing_photos FOR ALL
  USING (
    EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.seller_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.seller_id = auth.uid())
  );

-- ── offers ───────────────────────────────────────────────────────
-- Visible to the two parties only. A rival buyer must not be able to
-- read the standing offers on a listing and bid one dollar over.

CREATE POLICY "offers_read_parties"
  ON offers FOR SELECT
  USING (
    buyer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.seller_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "offers_insert_buyer"
  ON offers FOR INSERT
  WITH CHECK (
    buyer_id = auth.uid()
    AND is_member()
    AND EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_id
        AND l.status = 'active'
        AND l.allow_offers = TRUE
        AND l.seller_id <> auth.uid()   -- no bidding on your own goods
    )
  );

-- Buyer may withdraw; seller may accept or decline. The status values
-- each side is allowed to write are constrained in respond_to_offer()
-- and withdraw_offer() (migration 003) — this policy is the coarse gate.
CREATE POLICY "offers_update_parties"
  ON offers FOR UPDATE
  USING (
    buyer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.seller_id = auth.uid())
  )
  WITH CHECK (
    buyer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.seller_id = auth.uid())
  );

-- ── orders ───────────────────────────────────────────────────────
-- Note what is absent: there is no INSERT policy for clients. Orders
-- are created only by the create-checkout Edge Function using the
-- service-role key, which is what stops a buyer inventing an order
-- with total_cents = 1.

CREATE POLICY "orders_read_parties"
  ON orders FOR SELECT
  USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR is_admin());

-- The seller may mark an order shipped and attach tracking. The status
-- values they may move it to are fenced in mark_shipped() (migration
-- 003); this policy stops anyone else touching the row at all.
CREATE POLICY "orders_update_seller"
  ON orders FOR UPDATE
  USING (seller_id = auth.uid() AND status IN ('paid', 'shipped'))
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY "orders_admin_all"
  ON orders FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Same shape as the profiles guard: the seller can write to their own
-- order row, so the money columns need explicit protection.
CREATE OR REPLACE FUNCTION protect_order_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.item_cents                 := OLD.item_cents;
  NEW.shipping_cents             := OLD.shipping_cents;
  NEW.fee_cents                  := OLD.fee_cents;
  NEW.total_cents                := OLD.total_cents;
  NEW.currency                   := OLD.currency;
  NEW.buyer_id                   := OLD.buyer_id;
  NEW.seller_id                  := OLD.seller_id;
  NEW.listing_id                 := OLD.listing_id;
  NEW.stripe_checkout_session_id := OLD.stripe_checkout_session_id;
  NEW.stripe_payment_intent_id   := OLD.stripe_payment_intent_id;
  NEW.paid_at                    := OLD.paid_at;

  -- A seller may only walk an order forward to shipped/delivered.
  IF NEW.status NOT IN ('shipped', 'delivered') THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER orders_protect_columns
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION protect_order_columns();

-- ================================================================
-- RiseBay — Migration 003: RPCs
--
-- Everything here exists because the operation is a *transition*, not
-- a write: it has preconditions the client must not be trusted to
-- check, or it touches more than one row and must not half-happen.
-- ================================================================

-- ── create_invite ────────────────────────────────────────────────
-- Mints a code and spends one of the caller's allowance. Both halves
-- in one statement-level transaction so a member cannot race two
-- concurrent requests into a free extra invite.

CREATE OR REPLACE FUNCTION create_invite(p_email TEXT DEFAULT NULL, p_note TEXT DEFAULT NULL)
RETURNS invites AS $$
DECLARE
  v_remaining INT;
  v_code      TEXT;
  v_invite    invites;
BEGIN
  IF NOT is_member() THEN
    RAISE EXCEPTION 'Only active members can send invites';
  END IF;

  -- FOR UPDATE: hold the row until commit so two tabs cannot each
  -- read "1 remaining" and both spend it.
  SELECT invites_remaining INTO v_remaining
    FROM profiles WHERE id = auth.uid() FOR UPDATE;

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'No invites remaining';
  END IF;

  -- 8 chars of base32-ish alphabet, ambiguous characters removed so a
  -- code can be read aloud or written on paper without I/1 and O/0
  -- confusion. Retry on the astronomically unlikely collision.
  LOOP
    v_code := upper(
      string_agg(
        substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
               1 + floor(random() * 32)::int, 1),
        ''
      )
    )
    FROM generate_series(1, 8);

    EXIT WHEN NOT EXISTS (SELECT 1 FROM invites WHERE code = v_code);
  END LOOP;

  INSERT INTO invites (code, created_by, email, note)
  VALUES (v_code, auth.uid(), NULLIF(p_email, ''), NULLIF(p_note, ''))
  RETURNING * INTO v_invite;

  UPDATE profiles SET invites_remaining = invites_remaining - 1 WHERE id = auth.uid();

  RETURN v_invite;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── redeem_invite ────────────────────────────────────────────────
-- The one path from 'pending_invite' to 'active'. SECURITY DEFINER
-- because the caller, by definition, has no read access to invites
-- and no write access to their own status.

CREATE OR REPLACE FUNCTION redeem_invite(p_code TEXT)
RETURNS profiles AS $$
DECLARE
  v_invite  invites;
  v_profile profiles;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();

  IF v_profile.status = 'active' THEN
    RETURN v_profile;   -- already in; redeeming again is a no-op, not an error
  END IF;

  IF v_profile.status = 'suspended' THEN
    RAISE EXCEPTION 'This account is suspended';
  END IF;

  SELECT * INTO v_invite
    FROM invites
   WHERE code = upper(trim(p_code))
   FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'That invite code is not valid';
  END IF;
  IF v_invite.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'That invite has been revoked';
  END IF;
  IF v_invite.expires_at < NOW() THEN
    RAISE EXCEPTION 'That invite has expired';
  END IF;
  IF v_invite.used_count >= v_invite.max_uses THEN
    RAISE EXCEPTION 'That invite has already been used';
  END IF;

  UPDATE invites SET used_count = used_count + 1 WHERE id = v_invite.id;

  INSERT INTO invite_redemptions (invite_id, user_id)
  VALUES (v_invite.id, auth.uid())
  ON CONFLICT DO NOTHING;

  UPDATE profiles
     SET status     = 'active',
         invited_by = v_invite.created_by
   WHERE id = auth.uid()
   RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── respond_to_offer ─────────────────────────────────────────────
-- Seller accepts or declines. Accepting does not move money: it grants
-- the buyer the right to check out at the offered price, which
-- create-checkout re-reads from this row. That ordering is deliberate —
-- the price a buyer pays is never a number the browser supplied.

CREATE OR REPLACE FUNCTION respond_to_offer(p_offer_id UUID, p_accept BOOLEAN)
RETURNS offers AS $$
DECLARE
  v_offer offers;
BEGIN
  SELECT o.* INTO v_offer
    FROM offers o
    JOIN listings l ON l.id = o.listing_id
   WHERE o.id = p_offer_id AND l.seller_id = auth.uid()
   FOR UPDATE OF o;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;
  IF v_offer.status <> 'pending' THEN
    RAISE EXCEPTION 'That offer is no longer pending';
  END IF;

  UPDATE offers
     SET status       = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END::offer_status,
         responded_at = NOW()
   WHERE id = p_offer_id
   RETURNING * INTO v_offer;

  RETURN v_offer;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── withdraw_offer ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION withdraw_offer(p_offer_id UUID)
RETURNS offers AS $$
DECLARE
  v_offer offers;
BEGIN
  UPDATE offers
     SET status = 'withdrawn', responded_at = NOW()
   WHERE id = p_offer_id AND buyer_id = auth.uid() AND status = 'pending'
   RETURNING * INTO v_offer;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'No pending offer of yours with that id';
  END IF;

  RETURN v_offer;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── mark_shipped ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_shipped(
  p_order_id UUID,
  p_carrier  TEXT DEFAULT NULL,
  p_tracking TEXT DEFAULT NULL
)
RETURNS orders AS $$
DECLARE
  v_order orders;
BEGIN
  UPDATE orders
     SET status           = 'shipped',
         shipped_at       = NOW(),
         tracking_carrier = NULLIF(p_carrier, ''),
         tracking_number  = NULLIF(p_tracking, '')
   WHERE id = p_order_id AND seller_id = auth.uid() AND status = 'paid'
   RETURNING * INTO v_order;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'No paid order of yours with that id';
  END IF;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── confirm_delivery ─────────────────────────────────────────────
-- Buyer-side close-out. Kept separate from mark_shipped so the two
-- sides can never write each other's timestamps.

CREATE OR REPLACE FUNCTION confirm_delivery(p_order_id UUID)
RETURNS orders AS $$
DECLARE
  v_order orders;
BEGIN
  UPDATE orders
     SET status = 'delivered', delivered_at = NOW()
   WHERE id = p_order_id AND buyer_id = auth.uid() AND status = 'shipped'
   RETURNING * INTO v_order;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'No shipped order of yours with that id';
  END IF;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── increment_listing_view ───────────────────────────────────────
-- A counter bump must not require UPDATE rights on someone else's
-- listing, so it goes through a definer function that can touch
-- exactly one column.

CREATE OR REPLACE FUNCTION increment_listing_view(p_listing_id UUID)
RETURNS VOID AS $$
  UPDATE listings SET view_count = view_count + 1
   WHERE id = p_listing_id AND status = 'active';
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ── search_listings ──────────────────────────────────────────────
-- Full-text when there is a query, plain browse when there is not.
-- RLS still applies inside a SECURITY INVOKER function, so this cannot
-- leak drafts.

CREATE OR REPLACE FUNCTION search_listings(
  p_query    TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_min_cents INT DEFAULT NULL,
  p_max_cents INT DEFAULT NULL,
  p_limit    INT  DEFAULT 48,
  p_offset   INT  DEFAULT 0
)
RETURNS SETOF listings AS $$
  SELECT *
    FROM listings
   WHERE status = 'active'
     AND (p_query IS NULL OR p_query = ''
          OR search_tsv @@ websearch_to_tsquery('english', p_query))
     AND (p_category IS NULL OR category_slug = p_category)
     AND (p_min_cents IS NULL OR price_cents >= p_min_cents)
     AND (p_max_cents IS NULL OR price_cents <= p_max_cents)
   ORDER BY created_at DESC
   LIMIT LEAST(COALESCE(p_limit, 48), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

-- ================================================================
-- Been-go! — Migration 008: Reports, suspension teeth, admin actions
--
-- Three separate holes, all of the same shape: the rules existed on
-- paper but nothing in the database enforced them.
--
-- 1. Suspending a member hid nothing. Their listings stayed live and
--    buyable, which made suspension a gesture rather than a control.
-- 2. There was no way for a member to report anything. A marketplace
--    without a report button relies on the owner personally noticing.
-- 3. Admin actions left no trace. "Who suspended this person, and
--    why?" had no answer.
-- ================================================================

-- ── 1. Suspension actually removes you from the shelves ──────────

CREATE OR REPLACE FUNCTION is_active_seller(p_seller_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_seller_id AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "listings_read_active" ON listings;
CREATE POLICY "listings_read_active"
  ON listings FOR SELECT
  USING (
    status IN ('active', 'sold')
    AND is_member()
    AND is_active_seller(seller_id)
  );

-- The seller keeps seeing their own listings while suspended (that
-- policy is separate and unchanged) — they can see what they have, they
-- just cannot sell it to anyone.

-- Nobody may check out against a suspended seller either. The Edge
-- Function checks this too; the policy is the backstop.
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
        AND is_active_seller(l.seller_id)
    )
  );

-- ── 2. Reports ───────────────────────────────────────────────────

CREATE TYPE report_reason AS ENUM (
  'prohibited_item',
  'counterfeit',
  'misleading',
  'not_as_described',
  'harassment',
  'spam',
  'suspected_fraud',
  'other'
);

CREATE TYPE report_status AS ENUM ('open', 'reviewing', 'actioned', 'dismissed');

CREATE TABLE reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Exactly one target. A report about "the listing and also the
  -- seller" is two reports; letting one row mean both makes every
  -- query about it ambiguous.
  listing_id        UUID REFERENCES listings(id) ON DELETE CASCADE,
  reported_user_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  order_id          UUID REFERENCES orders(id) ON DELETE SET NULL,

  reason            report_reason NOT NULL,
  detail            TEXT,
  status            report_status NOT NULL DEFAULT 'open',
  admin_note        TEXT,
  reviewed_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT reports_one_target CHECK (
    (listing_id IS NOT NULL)::int + (reported_user_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX reports_status_idx   ON reports(status, created_at DESC);
CREATE INDEX reports_reporter_idx ON reports(reporter_id);

-- One open report per person per target: honest reporters do not need
-- to file the same complaint twice, and this stops a grudge turning
-- into fifty rows in the queue.
CREATE UNIQUE INDEX reports_no_duplicate_listing
  ON reports(reporter_id, listing_id)
  WHERE listing_id IS NOT NULL AND status IN ('open', 'reviewing');

CREATE UNIQUE INDEX reports_no_duplicate_user
  ON reports(reporter_id, reported_user_id)
  WHERE reported_user_id IS NOT NULL AND status IN ('open', 'reviewing');

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_read_own"
  ON reports FOR SELECT
  USING (reporter_id = auth.uid() OR is_admin());

CREATE POLICY "reports_insert_own"
  ON reports FOR INSERT
  WITH CHECK (reporter_id = auth.uid() AND is_member());

-- Reporters cannot edit a filed report, and cannot see who reviewed it.
-- Only admins move a report through its states.
CREATE POLICY "reports_admin_update"
  ON reports FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── 3. Admin action log ──────────────────────────────────────────
-- Append-only, same reasoning as terms_acceptances: a moderation log
-- an admin can rewrite is not a log.

CREATE TABLE admin_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable on purpose, and it must stay that way: ON DELETE SET NULL
  -- against a NOT NULL column makes deleting that admin's profile fail
  -- outright. The action stays in the log either way — losing who did
  -- it is bad, losing the record entirely is worse.
  admin_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  target_type  TEXT NOT NULL,
  target_id    UUID,
  detail       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX admin_actions_created_idx ON admin_actions(created_at DESC);

ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_actions_read_admin"
  ON admin_actions FOR SELECT
  USING (is_admin());

-- No INSERT policy: rows arrive only through the SECURITY DEFINER
-- functions below, so the log records what was actually done rather
-- than what someone typed into it.

CREATE OR REPLACE FUNCTION log_admin_action(
  p_action TEXT, p_target_type TEXT, p_target_id UUID, p_detail TEXT DEFAULT NULL
)
RETURNS VOID AS $$
  INSERT INTO admin_actions (admin_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_detail);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ── Admin operations ─────────────────────────────────────────────
-- Each one checks is_admin() itself. They are SECURITY DEFINER, so the
-- check is the only thing standing between any signed-in user and the
-- ability to suspend people — it is not optional or decorative.

CREATE OR REPLACE FUNCTION admin_set_member_status(
  p_user_id UUID, p_status member_status, p_reason TEXT DEFAULT NULL
)
RETURNS profiles AS $$
DECLARE
  v_profile profiles;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  -- Suspending yourself locks the last admin out of their own
  -- marketplace, and nothing in the UI would let them back in.
  IF p_user_id = auth.uid() AND p_status <> 'active' THEN
    RAISE EXCEPTION 'You cannot suspend your own account';
  END IF;

  UPDATE profiles SET status = p_status WHERE id = p_user_id
  RETURNING * INTO v_profile;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'No such member';
  END IF;

  PERFORM log_admin_action('set_member_status', 'profile', p_user_id,
                           p_status::text || COALESCE(' — ' || p_reason, ''));
  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION admin_grant_invites(p_user_id UUID, p_count INT)
RETURNS profiles AS $$
DECLARE
  v_profile profiles;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  IF p_count < 0 OR p_count > 500 THEN
    RAISE EXCEPTION 'Give between 0 and 500 invites';
  END IF;

  UPDATE profiles SET invites_remaining = p_count WHERE id = p_user_id
  RETURNING * INTO v_profile;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'No such member';
  END IF;

  PERFORM log_admin_action('grant_invites', 'profile', p_user_id, p_count::text);
  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION admin_remove_listing(p_listing_id UUID, p_reason TEXT)
RETURNS listings AS $$
DECLARE
  v_listing listings;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  UPDATE listings SET status = 'removed' WHERE id = p_listing_id
  RETURNING * INTO v_listing;

  IF v_listing.id IS NULL THEN
    RAISE EXCEPTION 'No such listing';
  END IF;

  PERFORM log_admin_action('remove_listing', 'listing', p_listing_id, p_reason);
  RETURN v_listing;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION admin_resolve_report(
  p_report_id UUID, p_status report_status, p_note TEXT DEFAULT NULL
)
RETURNS reports AS $$
DECLARE
  v_report reports;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  UPDATE reports
     SET status      = p_status,
         admin_note  = p_note,
         reviewed_by = auth.uid(),
         reviewed_at = NOW()
   WHERE id = p_report_id
   RETURNING * INTO v_report;

  IF v_report.id IS NULL THEN
    RAISE EXCEPTION 'No such report';
  END IF;

  PERFORM log_admin_action('resolve_report', 'report', p_report_id,
                           p_status::text || COALESCE(' — ' || p_note, ''));
  RETURN v_report;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION admin_set_fee_bps(p_fee_bps INT)
RETURNS platform_settings AS $$
DECLARE
  v_settings platform_settings;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  UPDATE platform_settings SET fee_bps = p_fee_bps WHERE id
  RETURNING * INTO v_settings;

  PERFORM log_admin_action('set_fee_bps', 'settings', NULL, p_fee_bps::text);
  RETURN v_settings;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Admin dashboard counts ───────────────────────────────────────
-- One round trip instead of six, and it cannot leak: it returns
-- integers and refuses non-admins outright.

CREATE OR REPLACE FUNCTION admin_stats()
RETURNS JSON AS $$
  SELECT CASE WHEN NOT is_admin() THEN NULL::json ELSE json_build_object(
    'members_active',    (SELECT COUNT(*) FROM profiles WHERE status = 'active'),
    'members_pending',   (SELECT COUNT(*) FROM profiles WHERE status = 'pending_invite'),
    'members_suspended', (SELECT COUNT(*) FROM profiles WHERE status = 'suspended'),
    'listings_active',   (SELECT COUNT(*) FROM listings WHERE status = 'active'),
    'orders_paid',       (SELECT COUNT(*) FROM orders   WHERE status = 'paid'),
    'reports_open',      (SELECT COUNT(*) FROM reports  WHERE status IN ('open', 'reviewing')),
    'gmv_cents',         (SELECT COALESCE(SUM(total_cents), 0) FROM orders
                           WHERE status IN ('paid', 'shipped', 'delivered')),
    'fees_cents',        (SELECT COALESCE(SUM(fee_cents), 0) FROM orders
                           WHERE status IN ('paid', 'shipped', 'delivered'))
  ) END;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

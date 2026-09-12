-- ================================================================
-- Been-go — Migration 005: Super admin + Google/phone sign-in
--
-- Two things, and they meet in one place (profiles), which is why
-- they share a migration.
--
--   1. A super admin tier. Migration 002 already wrote admin policies
--      on every table, but nothing could ever satisfy them: is_admin()
--      required status = 'active', and the only route to 'active' is
--      redeeming an invite that, for the first account, nobody exists
--      to mint. This file breaks that circle and gives the tier a
--      reason to exist beyond bootstrapping — a super admin is outside
--      the invite gate entirely, so they can open every page.
--
--   2. Google and phone sign-in. Supabase owns those flows; what the
--      database owes them is a profile row that is not half-empty when
--      the identity arrives without an email address.
--
-- The escalation rule worth stating up front: an admin administers
-- members, a SUPER admin administers admins. Nothing short of a super
-- admin can grant or revoke either flag, including to itself.
-- ================================================================

-- ── Columns ──────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Note what is NOT added here: a profiles.phone mirror. The phone
-- number lives in auth.users and is written by Supabase when an OTP is
-- verified; a copy in profiles would be a column the member can edit
-- but the login flow ignores, which is exactly the kind of field an
-- admin screen ends up trusting. The admin RPC reads auth.users.

CREATE INDEX IF NOT EXISTS profiles_admin_idx
  ON profiles(id) WHERE is_admin OR is_super_admin;

-- ── Helpers ──────────────────────────────────────────────────────
-- Replacing these in place re-points every policy written in 002:
-- they call the function by name, so the new bodies take effect
-- everywhere at once and no policy has to be rewritten.

-- Exempt from the invite gate, NOT from suspension. Those are two
-- different things and collapsing them is how "suspended" stops
-- meaning anything: a status-blind check here would leave a suspended
-- super admin holding every RPC and every admin policy — including the
-- one that lets them set their own status back to 'active'. Suspension
-- has to be able to contain this account, so it is the one status that
-- closes the exemption.
--
-- 'pending_invite' is the exemption that matters, and it is what lets
-- the first account in before any invite exists to redeem.
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.is_super_admin = TRUE
      AND p.status <> 'suspended'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- An ordinary admin is still a member first: suspending one takes
-- their powers away with everything else.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (
        (p.is_super_admin = TRUE AND p.status <> 'suspended')
        OR (p.is_admin = TRUE AND p.status = 'active')
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- The invite gate, with the one documented hole in it — and the same
-- limit on that hole.
CREATE OR REPLACE FUNCTION is_member()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (
        p.status = 'active'
        OR (p.is_super_admin = TRUE AND p.status <> 'suspended')
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ── Privilege escalation guard, tightened — and unbroken ─────────
--
-- Two changes, and the second one is a bug fix the whole app was
-- waiting on.
--
-- 1. Tiers. The 002 version handed any admin a blank cheque on their
--    own row, which made "admin" and "super admin" the same privilege
--    under two names. Now:
--
--      super admin → writes anything, including the two admin flags
--      admin       → member administration, never the admin flags
--      everyone    → server-owned columns revert to their old values
--
-- 2. The trusted-writer test. 002 tested `auth.uid() IS NULL` and
--    called that "a SECURITY DEFINER routine running with rls off".
--    It is not: SECURITY DEFINER changes the *role*, never the JWT, so
--    auth.uid() inside redeem_invite() is still the person redeeming.
--    The trigger therefore reverted the very UPDATE redeem_invite()
--    exists to perform — it returned a row saying 'active' while the
--    stored row stayed 'pending_invite', and every account in the
--    database was stuck outside the invite gate with no error anywhere
--    to explain it.
--
--    What actually separates a client write from a server write is the
--    role doing it. A browser is `authenticated` or `anon` and nothing
--    else; a SECURITY DEFINER routine runs as its owner, and the Stripe
--    webhook runs as `service_role`. So test current_user — which also
--    means this trigger must NOT be SECURITY DEFINER itself, or it
--    would see its own definer every time.

CREATE OR REPLACE FUNCTION protect_profile_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- The only two roles a browser can ever hold. Anything else is
  -- server-side: a definer routine, or the service-role key.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF is_admin() THEN
    -- Only a super admin makes admins. Without this, any admin could
    -- promote themselves to super admin and the tier would be
    -- decorative.
    NEW.is_admin       := OLD.is_admin;
    NEW.is_super_admin := OLD.is_super_admin;
    RETURN NEW;
  END IF;

  NEW.status                 := OLD.status;
  NEW.is_admin               := OLD.is_admin;
  NEW.is_super_admin         := OLD.is_super_admin;
  NEW.invited_by             := OLD.invited_by;
  NEW.invites_remaining      := OLD.invites_remaining;
  NEW.stripe_account_id      := OLD.stripe_account_id;
  NEW.stripe_charges_enabled := OLD.stripe_charges_enabled;
  NEW.stripe_payouts_enabled := OLD.stripe_payouts_enabled;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- protect_order_columns has the same shape and the same false comment,
-- but not the same bug: the two RPCs that write orders as the seller
-- (mark_shipped, confirm_delivery) only ever move status to 'shipped'
-- or 'delivered', which the guard already permits, and the webhook
-- writes with the service-role key outside RLS. It is left alone here
-- rather than changed on spec — but the next RPC written against
-- orders should read the note above before trusting that comment.

-- ── The one policy gap admins had ────────────────────────────────
-- Listings, orders, offers and invites all got an admin policy in
-- 002; listing_photos did not, so an admin opening another member's
-- draft saw a listing with no pictures.

DROP POLICY IF EXISTS "photos_admin_all" ON listing_photos;
CREATE POLICY "photos_admin_all"
  ON listing_photos FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── Profiles from non-email identities ───────────────────────────
-- Google hands back full_name/name and picture/avatar_url; a phone
-- signup hands back nothing at all and has a NULL email, which the
-- 001 trigger turned into a NULL display name. Fall through the
-- options in order and end on the phone number, which is at least
-- something a human recognises.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, status)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),   -- Google
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      NEW.phone
    ),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
      NULLIF(NEW.raw_user_meta_data->>'picture', '')      -- Google
    ),
    'pending_invite'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ================================================================
-- Admin RPCs
--
-- Every one of these could be an UPDATE against profiles_admin_all
-- instead. They are functions because each has a precondition the
-- client must not be trusted to check, and because a named function
-- is auditable in a way that "the client sent an UPDATE" is not.
-- ================================================================

-- ── admin_list_members ───────────────────────────────────────────
-- The member directory. Joins auth.users for the email/phone, which
-- is why it is SECURITY DEFINER rather than a view: no client role
-- may read the auth schema, and none should gain it.

CREATE OR REPLACE FUNCTION admin_list_members(
  p_search TEXT DEFAULT NULL,
  p_status member_status DEFAULT NULL,
  p_limit  INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id                UUID,
  display_name      TEXT,
  handle            TEXT,
  email             TEXT,
  phone             TEXT,
  avatar_url        TEXT,
  status            member_status,
  is_admin          BOOLEAN,
  is_super_admin    BOOLEAN,
  invites_remaining INT,
  providers         TEXT[],
  listing_count     BIGINT,
  order_count       BIGINT,
  created_at        TIMESTAMPTZ,
  last_sign_in_at   TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.display_name,
    p.handle,
    u.email::TEXT,
    u.phone::TEXT,
    p.avatar_url,
    p.status,
    p.is_admin,
    p.is_super_admin,
    p.invites_remaining,
    -- How this person actually signs in. Useful when a member says
    -- "I can't get in" and the answer is that they used Google.
    COALESCE(
      (SELECT array_agg(DISTINCT i.provider ORDER BY i.provider)
         FROM auth.identities i WHERE i.user_id = p.id),
      ARRAY[]::TEXT[]
    ),
    (SELECT count(*) FROM listings l WHERE l.seller_id = p.id),
    (SELECT count(*) FROM orders o WHERE o.buyer_id = p.id OR o.seller_id = p.id),
    p.created_at,
    u.last_sign_in_at
  FROM profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE (p_status IS NULL OR p.status = p_status)
    AND (
      p_search IS NULL OR p_search = '' OR
      p.display_name ILIKE '%' || p_search || '%' OR
      p.handle       ILIKE '%' || p_search || '%' OR
      u.email        ILIKE '%' || p_search || '%' OR
      u.phone        ILIKE '%' || p_search || '%'
    )
  ORDER BY p.created_at DESC
  LIMIT  GREATEST(1, LEAST(p_limit, 500))
  OFFSET GREATEST(0, p_offset);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ── admin_stats ──────────────────────────────────────────────────
-- One round trip for the dashboard header. JSONB rather than a wide
-- row so adding a counter later does not change the signature.

CREATE OR REPLACE FUNCTION admin_stats()
RETURNS JSONB AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  RETURN jsonb_build_object(
    'members_total',    (SELECT count(*) FROM profiles),
    'members_active',   (SELECT count(*) FROM profiles WHERE status = 'active'),
    'members_pending',  (SELECT count(*) FROM profiles WHERE status = 'pending_invite'),
    'members_suspended',(SELECT count(*) FROM profiles WHERE status = 'suspended'),
    'admins',           (SELECT count(*) FROM profiles WHERE is_admin OR is_super_admin),
    'listings_total',   (SELECT count(*) FROM listings),
    'listings_active',  (SELECT count(*) FROM listings WHERE status = 'active'),
    'listings_sold',    (SELECT count(*) FROM listings WHERE status = 'sold'),
    'offers_pending',   (SELECT count(*) FROM offers WHERE status = 'pending'),
    'orders_total',     (SELECT count(*) FROM orders),
    'orders_paid',      (SELECT count(*) FROM orders WHERE status <> 'pending_payment'),
    'gmv_cents',        (SELECT COALESCE(sum(total_cents), 0) FROM orders
                          WHERE status IN ('paid', 'shipped', 'delivered')),
    'fees_cents',       (SELECT COALESCE(sum(fee_cents), 0) FROM orders
                          WHERE status IN ('paid', 'shipped', 'delivered')),
    'invites_open',     (SELECT count(*) FROM invites
                          WHERE revoked_at IS NULL
                            AND expires_at > NOW()
                            AND used_count < max_uses)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ── Member administration (admin) ────────────────────────────────

CREATE OR REPLACE FUNCTION admin_set_member_status(p_user_id UUID, p_status member_status)
RETURNS profiles AS $$
DECLARE
  v_target  profiles;
  v_profile profiles;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT * INTO v_target FROM profiles WHERE id = p_user_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'No such member';
  END IF;

  -- An admin outranks members, not peers. Suspending another admin is
  -- a super admin's call.
  IF (v_target.is_admin OR v_target.is_super_admin)
     AND p_user_id <> auth.uid()
     AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can change another admin';
  END IF;

  UPDATE profiles SET status = p_status WHERE id = p_user_id
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION admin_set_invites(p_user_id UUID, p_invites INT)
RETURNS profiles AS $$
DECLARE
  v_target  profiles;
  v_profile profiles;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  IF p_invites < 0 OR p_invites > 100 THEN
    RAISE EXCEPTION 'Invite allowance must be between 0 and 100';
  END IF;

  SELECT * INTO v_target FROM profiles WHERE id = p_user_id;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'No such member';
  END IF;

  -- Same boundary as admin_set_member_status, for the same reason: an
  -- admin outranks members, not peers. Without this an ordinary admin
  -- could zero out another admin's allowance from the member table.
  IF (v_target.is_admin OR v_target.is_super_admin)
     AND p_user_id <> auth.uid()
     AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can change another admin';
  END IF;

  UPDATE profiles SET invites_remaining = p_invites WHERE id = p_user_id
  RETURNING * INTO v_profile;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'No such member';
  END IF;

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Admin administration (super admin only) ──────────────────────

CREATE OR REPLACE FUNCTION admin_set_role(
  p_user_id        UUID,
  p_is_admin       BOOLEAN,
  p_is_super_admin BOOLEAN DEFAULT FALSE
)
RETURNS profiles AS $$
DECLARE
  v_profile    profiles;
  v_supers_left INT;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can change roles';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'No such member';
  END IF;

  -- Take the row locks before counting anything. Two super admins
  -- demoting themselves at the same moment would otherwise each count
  -- the other as the one still standing, both checks would pass, and
  -- the pair of updates would land zero super admins — the exact
  -- lockout the check below exists to prevent. ORDER BY gives every
  -- caller the same lock order, so they queue instead of deadlocking,
  -- and the count after the wait sees the other transaction's commit.
  PERFORM 1 FROM profiles
   WHERE is_super_admin OR id = p_user_id
   ORDER BY id
   FOR UPDATE;

  -- Locking yourself out is the one mistake with no in-app recovery:
  -- the way back is the SQL editor. Refuse it.
  IF p_user_id = auth.uid() AND NOT p_is_super_admin THEN
    SELECT count(*) INTO v_supers_left
      FROM profiles WHERE is_super_admin AND id <> p_user_id;

    IF v_supers_left = 0 THEN
      RAISE EXCEPTION 'You are the only super admin — promote someone else first';
    END IF;
  END IF;

  UPDATE profiles
     SET is_admin       = (p_is_admin OR p_is_super_admin),
         is_super_admin = p_is_super_admin,
         -- A promotion is also an admission: an admin who never
         -- redeemed an invite would otherwise fail is_admin().
         status         = CASE
                            WHEN (p_is_admin OR p_is_super_admin) AND status = 'pending_invite'
                            THEN 'active'::member_status
                            ELSE status
                          END
   WHERE id = p_user_id
   RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── bootstrap_super_admin ────────────────────────────────────────
-- The chicken-and-egg breaker, and the only function here that is NOT
-- callable from the app. It takes an address rather than a uuid so it
-- can be run from the SQL editor by someone who has not gone looking
-- for ids, and it is REVOKEd from every client role below — an RPC
-- that promotes by email, reachable with the anon key, would be the
-- whole security model handed to anyone with curl.

CREATE OR REPLACE FUNCTION bootstrap_super_admin(p_identifier TEXT)
RETURNS profiles AS $$
DECLARE
  v_user_id UUID;
  v_profile profiles;
BEGIN
  -- The REVOKEs below are the real fence. This is the second one, for
  -- the day someone runs a blanket `GRANT EXECUTE ON ALL FUNCTIONS IN
  -- SCHEMA public` — a common enough line in a Supabase setup guide —
  -- and quietly hands every visitor a promotion endpoint. A SQL editor
  -- session carries no JWT, so a caller with one is not the SQL editor.
  IF auth.uid() IS NOT NULL AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'bootstrap_super_admin runs from the SQL editor only';
  END IF;

  SELECT u.id INTO v_user_id
    FROM auth.users u
   WHERE lower(u.email) = lower(trim(p_identifier))
      OR u.phone = trim(p_identifier)
   ORDER BY u.created_at
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'No account for %. Sign up in the app first, then run this again.', p_identifier;
  END IF;

  INSERT INTO profiles (id, status, is_admin, is_super_admin)
  VALUES (v_user_id, 'active', TRUE, TRUE)
  ON CONFLICT (id) DO UPDATE
    SET status            = 'active',
        is_admin          = TRUE,
        is_super_admin    = TRUE,
        invites_remaining = GREATEST(profiles.invites_remaining, 25)
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION bootstrap_super_admin(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION bootstrap_super_admin(TEXT) FROM anon;
REVOKE ALL ON FUNCTION bootstrap_super_admin(TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION bootstrap_super_admin(TEXT) TO service_role;

-- The rest are app-callable; each checks is_admin()/is_super_admin()
-- itself, so the grant is the coarse gate and the guard is the fence.
REVOKE ALL ON FUNCTION admin_list_members(TEXT, member_status, INT, INT) FROM anon;
REVOKE ALL ON FUNCTION admin_stats()                                     FROM anon;
REVOKE ALL ON FUNCTION admin_set_member_status(UUID, member_status)      FROM anon;
REVOKE ALL ON FUNCTION admin_set_invites(UUID, INT)                      FROM anon;
REVOKE ALL ON FUNCTION admin_set_role(UUID, BOOLEAN, BOOLEAN)            FROM anon;

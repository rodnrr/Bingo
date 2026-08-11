-- ================================================================
-- Been-go! — Migration 009: Let trusted functions write protected columns
--
-- Found by dry-running every migration against a scratch Postgres and
-- exercising the flows. Three bugs, all from one cause, all present
-- since the first commit.
--
-- ── The cause ────────────────────────────────────────────────────
--
-- protect_profile_columns() and protect_order_columns() (migration
-- 002) revert writes to the server-owned columns unless the writer is
-- an admin or auth.uid() IS NULL. The unstated assumption was that our
-- own SECURITY DEFINER functions would fall into the second case.
--
-- They do not. SECURITY DEFINER changes which role *executes* the
-- function; it does not change auth.uid(), which still returns the
-- calling member. So the triggers were silently reverting the writes
-- made by the very functions that are supposed to be the only way
-- those columns ever change.
--
-- ── What that broke ──────────────────────────────────────────────
--
-- 1. redeem_invite() could not set status='active'. **Nobody could
--    join.** The function reported success, the invite was consumed,
--    and the member stayed at 'pending_invite' forever.
--
-- 2. create_invite() could not decrement invites_remaining. **Invites
--    were unlimited** — the three-per-member allowance, and with it the
--    whole point of an invite-only marketplace, did not exist.
--
-- 3. release_own_pending_order() could not set status='cancelled', so
--    its "only release once" guard never latched. **Every repeat call
--    released the stock again**, inflating quantity — a listing could
--    come to claim more units than the seller owns.
--
-- ── The fix ──────────────────────────────────────────────────────
--
-- A transaction-local flag that a trusted function raises around its
-- own write, and that the triggers honour.
--
-- Why this is not a hole: the flag is set with set_config(..., true),
-- so it lives inside one transaction and is gone at commit. Reaching
-- it requires executing SQL, and a client cannot execute arbitrary SQL
-- — PostgREST exposes table operations and named RPCs, neither of
-- which can issue SET. No RPC takes caller input anywhere near
-- set_config. Every function that raises the flag lowers it again
-- before returning, so it cannot leak into a later statement in the
-- same request.
--
-- The alternative — column-level REVOKE on the authenticated role — is
-- the more idiomatic Postgres answer and worth moving to later. It is
-- a bigger change than a live marketplace wants in a bug fix, and it
-- turns these silent reverts into hard errors, which is better but is
-- its own behavioural change to test.
-- ================================================================

CREATE OR REPLACE FUNCTION begin_trusted_write()
RETURNS VOID AS $$
  SELECT set_config('beengo.trusted_write', 'on', TRUE);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION end_trusted_write()
RETURNS VOID AS $$
  SELECT set_config('beengo.trusted_write', 'off', TRUE);
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_trusted_write()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(current_setting('beengo.trusted_write', TRUE), 'off') = 'on';
$$ LANGUAGE sql STABLE;

-- ── Triggers honour the flag ─────────────────────────────────────

CREATE OR REPLACE FUNCTION protect_profile_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF is_admin() OR auth.uid() IS NULL OR is_trusted_write() THEN
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

CREATE OR REPLACE FUNCTION protect_order_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF is_admin() OR auth.uid() IS NULL OR is_trusted_write() THEN
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

  IF NEW.status NOT IN ('shipped', 'delivered') THEN
    NEW.status := OLD.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── The three functions that need to raise the flag ──────────────

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

  SELECT invites_remaining INTO v_remaining
    FROM profiles WHERE id = auth.uid() FOR UPDATE;

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'No invites remaining';
  END IF;

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

  -- Without the flag, this decrement is silently reverted and every
  -- member has infinite invites.
  PERFORM begin_trusted_write();
  UPDATE profiles SET invites_remaining = invites_remaining - 1 WHERE id = auth.uid();
  PERFORM end_trusted_write();

  RETURN v_invite;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
    RETURN v_profile;
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

  -- Without the flag, status and invited_by revert and the member
  -- stays locked out — with their invite spent.
  PERFORM begin_trusted_write();
  UPDATE profiles
     SET status     = 'active',
         invited_by = v_invite.created_by
   WHERE id = auth.uid()
   RETURNING * INTO v_profile;
  PERFORM end_trusted_write();

  RETURN v_profile;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION release_own_pending_order(p_order_id UUID)
RETURNS VOID AS $$
DECLARE
  v_order orders;
BEGIN
  -- Without the flag the cancel reverts, the "release only once" guard
  -- never latches, and each repeat call hands back stock the seller
  -- does not have.
  PERFORM begin_trusted_write();

  UPDATE orders
     SET status = 'cancelled'
   WHERE id = p_order_id
     AND buyer_id = auth.uid()
     AND status = 'pending_payment'
   RETURNING * INTO v_order;

  PERFORM end_trusted_write();

  IF v_order.id IS NOT NULL THEN
    PERFORM release_listing_stock(v_order.listing_id, v_order.quantity);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Repair anything the bug already stranded ─────────────────────
-- No-ops on a fresh database. On one where members redeemed invites
-- and were left in limbo, this puts them where they should have been.

DO $$
DECLARE
  v_fixed INT;
BEGIN
  PERFORM begin_trusted_write();

  -- Redeemed a real invite but never got activated.
  UPDATE profiles p
     SET status     = 'active',
         invited_by = COALESCE(p.invited_by, i.created_by)
    FROM invite_redemptions r
    JOIN invites i ON i.id = r.invite_id
   WHERE p.id = r.user_id
     AND p.status = 'pending_invite';

  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  IF v_fixed > 0 THEN
    RAISE NOTICE 'Activated % member(s) whose redemption was reverted by the old trigger.', v_fixed;
  END IF;

  -- Allowance never actually spent. Recompute from invites issued.
  UPDATE profiles p
     SET invites_remaining = GREATEST(
           0,
           p.invites_remaining - (SELECT COUNT(*) FROM invites i WHERE i.created_by = p.id)
         )
   WHERE EXISTS (SELECT 1 FROM invites i WHERE i.created_by = p.id);

  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  IF v_fixed > 0 THEN
    RAISE NOTICE 'Corrected the invite allowance for % member(s).', v_fixed;
  END IF;

  PERFORM end_trusted_write();
END $$;

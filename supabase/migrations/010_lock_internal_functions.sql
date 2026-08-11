-- ================================================================
-- Been-go! — Migration 010: Stop exposing the internals as API
--
-- Found by Supabase's security advisor after applying 001–009, and
-- confirmed by asking the database directly which roles could execute
-- what.
--
-- ── The problem ──────────────────────────────────────────────────
--
-- PostgREST publishes every function in the `public` schema as an RPC
-- endpoint, and Postgres grants EXECUTE to PUBLIC by default. So the
-- helpers written to be called *by other functions* were also, without
-- anyone deciding it, part of the public API — and being SECURITY
-- DEFINER, they run with owner privileges and do not check who called
-- them, because they were never meant to face a caller.
--
-- What a signed-in member could do with a bare HTTP request:
--
--   release_listing_stock(any_listing, 999999)
--       → inflate anyone's inventory to any number
--   reserve_listing_stock(rivals_listing, all_of_it)
--       → empty a competitor's listing; denial of service
--   log_admin_action('...', '...', ...)
--       → forge rows in the append-only moderation log
--   settle_listing_after_sale(any_listing)
--       → mark somebody else's listing sold
--   begin_trusted_write()
--       → raise the flag that lifts the column guards
--
-- The last one is the narrowest in practice — the flag is
-- transaction-local and PostgREST gives one transaction per request,
-- so it cannot be chained to a following PATCH. That is an argument
-- about the transport, though, not a property of the database, and it
-- is the wrong thing to rely on.
--
-- ── The fix ──────────────────────────────────────────────────────
--
-- Revoke EXECUTE from PUBLIC, anon, and authenticated; grant it back
-- to service_role only where an Edge Function actually calls it. The
-- functions still work when invoked from inside another SECURITY
-- DEFINER function, because that runs as the owner.
--
-- Nothing here changes what the app can do. It changes what a request
-- that is not the app can do.
-- ================================================================

-- ── Called only from inside other functions ──────────────────────

REVOKE EXECUTE ON FUNCTION begin_trusted_write()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION end_trusted_write()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION is_trusted_write()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION log_admin_action(TEXT, TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ── Inventory: the Edge Functions call these, members must not ───
-- create-checkout reserves and releases; stripe-webhook settles and
-- releases. All three run with the service-role key.

REVOKE EXECUTE ON FUNCTION reserve_listing_stock(UUID, INT)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION release_listing_stock(UUID, INT)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION settle_listing_after_sale(UUID)      FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION reserve_listing_stock(UUID, INT)      TO service_role;
GRANT EXECUTE ON FUNCTION release_listing_stock(UUID, INT)      TO service_role;
GRANT EXECUTE ON FUNCTION settle_listing_after_sale(UUID)       TO service_role;

-- ── Sweepers: pg_cron runs these as the superuser ────────────────
-- Left callable by service_role so they can also be kicked by hand
-- from a trusted context when pg_cron is not enabled.

REVOKE EXECUTE ON FUNCTION release_stale_reservations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION expire_stale_offers()        FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION release_stale_reservations()  TO service_role;
GRANT EXECUTE ON FUNCTION expire_stale_offers()         TO service_role;

-- ── Trigger functions ────────────────────────────────────────────
-- Not reachable over RPC anyway (PostgREST will not expose a function
-- returning `trigger`), but there is no reason for the grant to exist.

REVOKE EXECUTE ON FUNCTION handle_new_user()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION touch_updated_at()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION protect_profile_columns()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION protect_order_columns()     FROM PUBLIC, anon, authenticated;

-- ── search_path hardening ────────────────────────────────────────
-- A SECURITY DEFINER function without a pinned search_path can be
-- steered into calling an attacker's function of the same name. These
-- two were the only ones missing it.

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION is_trusted_write()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(current_setting('beengo.trusted_write', TRUE), 'off') = 'on';
$$ LANGUAGE sql STABLE SET search_path = public;

-- CREATE OR REPLACE resets the default PUBLIC grant, so re-revoke.
REVOKE EXECUTE ON FUNCTION touch_updated_at()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION is_trusted_write()  FROM PUBLIC, anon, authenticated;

-- ================================================================
-- Been-go! — Migration 006: Stock reservation
--
-- The bug this closes: stock was decremented by the webhook, i.e.
-- *after* payment. Two buyers could both open checkout for the last
-- item, both pay, and the second one's money would be taken for
-- something that no longer exists.
--
-- The fix is to move the decrement to the moment checkout opens, and
-- to make it a single conditional UPDATE. `WHERE quantity >= p_qty` is
-- evaluated by Postgres while it holds the row lock, so of two
-- concurrent callers exactly one succeeds and the other gets zero rows
-- back — no read-then-write gap for them to race through.
--
-- A reservation is therefore held by every pending_payment order, and
-- must be given back if that order never completes. Three paths do
-- that: the session-expired webhook, the cancelled-order webhook, and
-- release_stale_reservations() for anything that falls through both.
-- ================================================================

-- ── Reserve ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reserve_listing_stock(p_listing_id UUID, p_qty INT)
RETURNS listings AS $$
DECLARE
  v_listing listings;
BEGIN
  IF p_qty IS NULL OR p_qty < 1 THEN
    RAISE EXCEPTION 'Quantity must be at least 1';
  END IF;

  UPDATE listings
     SET quantity = quantity - p_qty
   WHERE id = p_listing_id
     AND status = 'active'
     AND quantity >= p_qty
   RETURNING * INTO v_listing;

  -- Zero rows means the guard failed: sold out, or no longer active.
  -- Deliberately one message for both — a buyer does not need to know
  -- which, and the distinction invites retry loops.
  IF v_listing.id IS NULL THEN
    RAISE EXCEPTION 'Not enough of those left';
  END IF;

  RETURN v_listing;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Release ──────────────────────────────────────────────────────
-- Puts stock back and reopens a listing that had been emptied. Never
-- touches `sold_at`: that timestamp means "somebody actually bought
-- it", and a released reservation means nobody did.

CREATE OR REPLACE FUNCTION release_listing_stock(p_listing_id UUID, p_qty INT)
RETURNS VOID AS $$
  UPDATE listings
     SET quantity = quantity + p_qty,
         status   = CASE WHEN status = 'sold' THEN 'active'::listing_status ELSE status END,
         sold_at  = CASE WHEN status = 'sold' THEN NULL ELSE sold_at END
   WHERE id = p_listing_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ── Settle ───────────────────────────────────────────────────────
-- Called by the webhook once payment lands. The stock is already gone;
-- all that is left is to close the listing if that was the last one.

CREATE OR REPLACE FUNCTION settle_listing_after_sale(p_listing_id UUID)
RETURNS VOID AS $$
  UPDATE listings
     SET status  = 'sold',
         sold_at = NOW()
   WHERE id = p_listing_id
     AND quantity <= 0
     AND status = 'active';
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ── Buyer-initiated release ──────────────────────────────────────
-- Stripe only emits checkout.session.expired at the session deadline,
-- which is 30 minutes away. Without this, backing out of checkout on a
-- one-of-a-kind listing hides it from everyone for half an hour.
--
-- Safe to call twice, and safe to race against the webhook: the
-- `status = 'pending_payment'` guard means whichever arrives second
-- updates zero rows and releases nothing.

CREATE OR REPLACE FUNCTION release_own_pending_order(p_order_id UUID)
RETURNS VOID AS $$
DECLARE
  v_order orders;
BEGIN
  UPDATE orders
     SET status = 'cancelled'
   WHERE id = p_order_id
     AND buyer_id = auth.uid()
     AND status = 'pending_payment'
   RETURNING * INTO v_order;

  IF v_order.id IS NOT NULL THEN
    PERFORM release_listing_stock(v_order.listing_id, v_order.quantity);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Stale reservation sweeper ────────────────────────────────────
-- Stripe sends checkout.session.expired reliably, but "reliably" is not
-- "always" — a webhook can be misconfigured, or a session can be
-- created and never redirected to. Without this, one dropped event
-- strands the last item of a listing forever.
--
-- The cutoff is 60 minutes against a 30-minute session expiry, so this
-- can only ever act on orders Stripe has already given up on.

CREATE OR REPLACE FUNCTION release_stale_reservations()
RETURNS INT AS $$
DECLARE
  v_order  RECORD;
  v_count  INT := 0;
BEGIN
  FOR v_order IN
    UPDATE orders
       SET status = 'cancelled'
     WHERE status = 'pending_payment'
       AND created_at < NOW() - INTERVAL '60 minutes'
    RETURNING listing_id, quantity
  LOOP
    PERFORM release_listing_stock(v_order.listing_id, v_order.quantity);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Schedule it if pg_cron is enabled, and stay quiet if it is not —
-- a migration that fails because an optional extension is missing is
-- worse than a sweeper that has to be run by hand. Enable it with
-- `CREATE EXTENSION pg_cron;` (Supabase → Database → Extensions) and
-- re-run this block.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'beengo-release-stale-reservations',
      '*/15 * * * *',
      'SELECT release_stale_reservations();'
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — run release_stale_reservations() manually or enable the extension.';
  END IF;
END $$;

-- ── Browse must not show what cannot be bought ───────────────────
-- Stock now hits zero before the sale settles, so an active listing
-- can legitimately have nothing left in it for a few minutes. Those
-- must drop out of search.

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
     AND quantity > 0
     AND (p_query IS NULL OR p_query = ''
          OR search_tsv @@ websearch_to_tsquery('english', p_query))
     AND (p_category IS NULL OR category_slug = p_category)
     AND (p_min_cents IS NULL OR price_cents >= p_min_cents)
     AND (p_max_cents IS NULL OR price_cents <= p_max_cents)
   ORDER BY created_at DESC
   LIMIT LEAST(COALESCE(p_limit, 48), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

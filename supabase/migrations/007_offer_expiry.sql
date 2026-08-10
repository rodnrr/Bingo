-- ================================================================
-- Been-go! — Migration 007: Offers that actually expire
--
-- The `expired` status existed and nothing ever set it, so a pending
-- offer was pending forever — and an accepted one could be redeemed
-- months later at a price the seller had long forgotten agreeing to.
--
-- The important half of this migration is not the sweeper. It is that
-- every place an offer is *used* now re-checks the deadline itself. A
-- correctness guarantee that depends on a cron job having run is not a
-- guarantee; the sweeper only exists to keep the UI tidy.
-- ================================================================

ALTER TABLE offers
  ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days');

-- An accepted offer is a held price. It should not be held indefinitely:
-- the buyer gets 48 hours from acceptance to pay before the seller is
-- free again.
ALTER TABLE offers
  ADD COLUMN pay_by TIMESTAMPTZ;

CREATE INDEX offers_expiry_idx ON offers(expires_at) WHERE status = 'pending';
CREATE INDEX offers_payby_idx  ON offers(pay_by)     WHERE status = 'accepted';

-- ── Respond, with the deadline enforced ──────────────────────────

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

  -- Late acceptance is the dangerous direction: the buyer has moved on
  -- and is about to be charged. Mark it expired rather than honouring it.
  IF v_offer.expires_at < NOW() THEN
    UPDATE offers SET status = 'expired', responded_at = NOW()
     WHERE id = p_offer_id
     RETURNING * INTO v_offer;
    RAISE EXCEPTION 'That offer expired on %', to_char(v_offer.expires_at, 'Mon DD');
  END IF;

  UPDATE offers
     SET status       = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END::offer_status,
         responded_at = NOW(),
         pay_by       = CASE WHEN p_accept THEN NOW() + INTERVAL '48 hours' ELSE NULL END
   WHERE id = p_offer_id
   RETURNING * INTO v_offer;

  RETURN v_offer;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Sweeper ──────────────────────────────────────────────────────
-- Cleanup only. Both deadlines are independently enforced above and in
-- create-checkout, so a sweeper that never runs costs tidiness, not
-- correctness.

CREATE OR REPLACE FUNCTION expire_stale_offers()
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  WITH expired AS (
    UPDATE offers
       SET status = 'expired', responded_at = NOW()
     WHERE (status = 'pending'  AND expires_at < NOW())
        OR (status = 'accepted' AND pay_by IS NOT NULL AND pay_by < NOW())
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM expired;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'beengo-expire-stale-offers',
      '7 * * * *',
      'SELECT expire_stale_offers();'
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed — run expire_stale_offers() manually or enable the extension.';
  END IF;
END $$;

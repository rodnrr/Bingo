-- ================================================================
-- Been-go! — Migration 011: Choosing the cover photo
--
-- The first photo by `position` is the one the browse grid, the
-- seller's listings page, and every order summary show. That has always
-- been true. What was missing is any way to say which photo that is —
-- the uploader could add and delete, nothing else. A seller whose best
-- shot went up second had to delete everything and start again.
--
-- Reordering is a multi-row transition, so it belongs in an RPC rather
-- than a handful of client-side UPDATEs that can half-apply and leave
-- two photos claiming position 0.
-- ================================================================

CREATE OR REPLACE FUNCTION set_listing_cover(p_listing_id UUID, p_photo_id UUID)
RETURNS SETOF listing_photos AS $$
BEGIN
  -- Ownership is checked here, not assumed from RLS: this function is
  -- SECURITY DEFINER, so the policies on listing_photos do not fire.
  IF NOT EXISTS (
    SELECT 1 FROM listings
     WHERE id = p_listing_id AND seller_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not your listing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM listing_photos
     WHERE id = p_photo_id AND listing_id = p_listing_id
  ) THEN
    RAISE EXCEPTION 'No such photo on that listing';
  END IF;

  -- Everything else closes ranks behind it, keeping its relative order.
  -- Renumbering from 1 rather than patching gaps means positions stay
  -- dense however many times this is called.
  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY position, created_at) AS rn
      FROM listing_photos
     WHERE listing_id = p_listing_id
       AND id <> p_photo_id
  )
  UPDATE listing_photos lp
     SET position = ordered.rn
    FROM ordered
   WHERE lp.id = ordered.id;

  UPDATE listing_photos SET position = 0 WHERE id = p_photo_id;

  RETURN QUERY
    SELECT * FROM listing_photos
     WHERE listing_id = p_listing_id
     ORDER BY position;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Repair any listing whose positions already collide ───────────
-- The uploader numbered new photos from the *count* of existing ones,
-- so deleting a middle photo and adding another gave two photos the
-- same position — and which one became the cover was then down to
-- whatever order Postgres happened to return. Renumber densely.
-- (The client-side cause is fixed in api.ts; this cleans up after it.)

DO $$
DECLARE
  v_fixed INT;
BEGIN
  WITH dupes AS (
    SELECT listing_id
      FROM listing_photos
     GROUP BY listing_id, position
    HAVING COUNT(*) > 1
  ),
  renumbered AS (
    SELECT id, ROW_NUMBER() OVER (
             PARTITION BY listing_id ORDER BY position, created_at
           ) - 1 AS rn
      FROM listing_photos
     WHERE listing_id IN (SELECT listing_id FROM dupes)
  )
  UPDATE listing_photos lp
     SET position = renumbered.rn
    FROM renumbered
   WHERE lp.id = renumbered.id;

  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  IF v_fixed > 0 THEN
    RAISE NOTICE 'Renumbered % photo(s) whose positions collided.', v_fixed;
  END IF;
END $$;

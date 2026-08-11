-- Behavioural checks for the things that would cost real money if wrong.
\set ON_ERROR_STOP on

-- ── Fixtures: two members, both active and agreed ────────────────
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'seller@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'buyer1@test.com'),
  ('33333333-3333-3333-3333-333333333333', 'buyer2@test.com');

UPDATE profiles SET status = 'active', display_name = 'Seller'
  WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE profiles SET status = 'active', display_name = 'Buyer One'
  WHERE id = '22222222-2222-2222-2222-222222222222';
UPDATE profiles SET status = 'active', display_name = 'Buyer Two'
  WHERE id = '33333333-3333-3333-3333-333333333333';

INSERT INTO terms_acceptances (user_id, version)
SELECT id, current_terms_version() FROM profiles;

\echo '### 1. Signup trigger created a profile per auth user'
SELECT count(*) = 3 AS pass FROM profiles;

-- ── The last item, contested ─────────────────────────────────────
INSERT INTO listings (id, seller_id, title, description, price_cents, quantity, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'The only one', 'Single unit', 5000, 1, 'active');

\echo '### 2. First buyer reserves the last item'
SELECT quantity = 0 AS pass
  FROM reserve_listing_stock('aaaaaaaa-0000-0000-0000-000000000001', 1);

\echo '### 3. Second buyer is refused (this is the oversell bug)'
DO $$
BEGIN
  PERFORM reserve_listing_stock('aaaaaaaa-0000-0000-0000-000000000001', 1);
  RAISE EXCEPTION 'FAIL — second reservation succeeded, item is oversold';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%Not enough%' THEN RAISE NOTICE 'pass'; ELSE RAISE; END IF;
END $$;

\echo '### 4. Sold-out listing drops out of search'
SELECT count(*) = 0 AS pass FROM search_listings();

\echo '### 5. Abandoned checkout gives the stock back'
SELECT release_listing_stock('aaaaaaaa-0000-0000-0000-000000000001', 1);
SELECT quantity = 1 AND status = 'active' AND sold_at IS NULL AS pass
  FROM listings WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '### 6. ...and it is buyable again'
SELECT count(*) = 1 AS pass FROM search_listings();

-- ── Invites ──────────────────────────────────────────────────────
\echo '### 7. Invite allowance is spent, not infinite'
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT code IS NOT NULL AS pass FROM create_invite('friend@test.com', 'a friend');
SELECT invites_remaining = 2 AS pass FROM profiles
  WHERE id = '11111111-1111-1111-1111-111111111111';

\echo '### 8. A used code cannot be redeemed twice'
INSERT INTO auth.users (id, email) VALUES
  ('44444444-4444-4444-4444-444444444444', 'newcomer@test.com');
SET request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
SELECT status = 'active' AS pass FROM redeem_invite((SELECT code FROM invites LIMIT 1));

INSERT INTO auth.users (id, email) VALUES
  ('55555555-5555-5555-5555-555555555555', 'gatecrasher@test.com');
SET request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
DO $$
BEGIN
  PERFORM redeem_invite((SELECT code FROM invites LIMIT 1));
  RAISE EXCEPTION 'FAIL — a single-use code was redeemed twice';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%already been used%' THEN RAISE NOTICE 'pass'; ELSE RAISE; END IF;
END $$;

-- ── Offers ───────────────────────────────────────────────────────
\echo '### 9. An expired offer cannot be accepted late'
INSERT INTO offers (id, listing_id, buyer_id, amount_cents, status, expires_at)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222',
        4000, 'pending', NOW() - INTERVAL '1 day');

SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
DO $$
BEGIN
  PERFORM respond_to_offer('bbbbbbbb-0000-0000-0000-000000000001', TRUE);
  RAISE EXCEPTION 'FAIL — an expired offer was accepted';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%expired%' THEN RAISE NOTICE 'pass'; ELSE RAISE; END IF;
END $$;

\echo '### 10. Accepting sets a 48-hour pay-by deadline'
INSERT INTO offers (id, listing_id, buyer_id, amount_cents, status)
VALUES ('bbbbbbbb-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000001',
        '33333333-3333-3333-3333-333333333333', 4500, 'pending');

SELECT status = 'accepted' AND pay_by > NOW() + INTERVAL '47 hours' AS pass
  FROM respond_to_offer('bbbbbbbb-0000-0000-0000-000000000002', TRUE);

\echo '### 11. The sweeper retires what the deadlines already refuse'
SELECT expire_stale_offers() >= 1 AS pass;

-- ── Privilege escalation ─────────────────────────────────────────
\echo '### 12. A member cannot make themselves an admin'
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
UPDATE profiles SET is_admin = TRUE, invites_remaining = 999, status = 'active'
  WHERE id = '22222222-2222-2222-2222-222222222222';
SELECT is_admin = FALSE AND invites_remaining = 3 AS pass
  FROM profiles WHERE id = '22222222-2222-2222-2222-222222222222';

\echo '### 13. A non-admin cannot suspend anyone'
DO $$
BEGIN
  PERFORM admin_set_member_status('11111111-1111-1111-1111-111111111111', 'suspended');
  RAISE EXCEPTION 'FAIL — a non-admin suspended a member';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%Admins only%' THEN RAISE NOTICE 'pass'; ELSE RAISE; END IF;
END $$;

\echo '### 14. A seller cannot rewrite the money on their own order'
INSERT INTO orders (id, listing_id, buyer_id, seller_id, item_cents, total_cents, fee_cents, status)
VALUES ('cccccccc-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111',
        5000, 5000, 400, 'paid');

SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
UPDATE orders SET fee_cents = 0, total_cents = 999999, status = 'delivered'
  WHERE id = 'cccccccc-0000-0000-0000-000000000001';
SELECT fee_cents = 400 AND total_cents = 5000 AS pass
  FROM orders WHERE id = 'cccccccc-0000-0000-0000-000000000001';

\echo '### 15. Bootstrapping the first admin from the SQL editor works'
-- PLAN.md Step 3: run as postgres, where auth.uid() is NULL. This is the
-- one context in which is_admin may be written, and it is why the
-- bootstrap has to happen in the SQL editor rather than in the app.
RESET request.jwt.claim.sub;
UPDATE profiles SET is_admin = TRUE WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT is_admin AS pass FROM profiles WHERE id = '11111111-1111-1111-1111-111111111111';

\echo '### 15b. Admin actions work and are logged'
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SELECT status = 'suspended' AS pass
  FROM admin_set_member_status('33333333-3333-3333-3333-333333333333', 'suspended', 'testing');
SELECT count(*) = 1 AS pass FROM admin_actions WHERE action = 'set_member_status';

\echo '### 16. Terms acceptance is one row per version and cannot be forged'
SELECT has_accepted_terms() AS pass;
DO $$
BEGIN
  PERFORM accept_terms('1999-01-01');
  RAISE EXCEPTION 'FAIL — consent recorded against a version not in force';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%updated%' THEN RAISE NOTICE 'pass'; ELSE RAISE; END IF;
END $$;

\echo '### 17. Fee lives in exactly one place'
SELECT current_fee_bps() = 800 AS pass;
SELECT fee_bps = 500 AS pass FROM admin_set_fee_bps(500);
SELECT current_fee_bps() = 500 AS pass;

\echo '### 18. Stale reservations are swept'
INSERT INTO orders (listing_id, buyer_id, seller_id, item_cents, total_cents, status, created_at)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111',
        5000, 5000, 'pending_payment', NOW() - INTERVAL '2 hours');
SELECT release_stale_reservations() = 1 AS pass;

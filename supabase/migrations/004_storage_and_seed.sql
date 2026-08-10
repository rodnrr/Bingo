-- ================================================================
-- Been-go — Migration 004: Photo storage + category seed
-- ================================================================

-- ── Storage bucket for listing photos ────────────────────────────
-- Public read: a photo URL is effectively public the moment a buyer
-- can see the listing, and signed URLs on every card would be a lot of
-- round trips for no privacy gain. Writes are fenced to the uploader's
-- own folder.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'listing-photos',
  'listing-photos',
  TRUE,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "listing_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-photos');

-- Path convention: listing-photos/{user_id}/{listing_id}/{filename}
-- The first path segment must be the caller's own uid.
CREATE POLICY "listing_photos_insert_own_folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND is_member()
  );

CREATE POLICY "listing_photos_update_own_folder"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "listing_photos_delete_own_folder"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Category seed ────────────────────────────────────────────────
-- Deliberately shallow. One level, twelve buckets, names people
-- actually use. A taxonomy nobody can hold in their head is a
-- taxonomy sellers file things into at random.

INSERT INTO categories (slug, name, icon, sort_order) VALUES
  ('electronics',   'Electronics',            'smartphone',   10),
  ('clothing',      'Clothing & Shoes',       'shirt',        20),
  ('home',          'Home & Garden',          'lamp',         30),
  ('tools',         'Tools & Equipment',      'wrench',       40),
  ('vehicles',      'Vehicles & Parts',       'car',          50),
  ('collectibles',  'Collectibles & Art',     'palette',      60),
  ('music',         'Musical Instruments',    'music',        70),
  ('sports',        'Sports & Outdoors',      'bike',         80),
  ('toys',          'Toys & Games',           'gamepad-2',    90),
  ('books',         'Books & Media',          'book-open',   100),
  ('beauty',        'Health & Beauty',        'sparkles',    110),
  ('other',         'Everything Else',        'package',     120)
ON CONFLICT (slug) DO NOTHING;

-- Run this against whatever database your DB_NAME env var points to (see the
-- naming-drift note in product-images-schema.sql - same caveat applies).
--
-- One table for both review sources, not two separate systems: imported
-- (manually entered or CSV-bulk-imported by an admin who already collected
-- the review text themselves - see POST /api/reviews/import - no scraping,
-- no third-party service) and customer-submitted (via POST /api/reviews,
-- the real review-collection path). Both go through the same moderation
-- queue before showing publicly - an imported review isn't exempt from a
-- human sanity check just because it didn't come from a customer form.
CREATE TABLE IF NOT EXISTS reviews (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  product_id           VARCHAR(64) NOT NULL,
  source               ENUM('imported', 'customer') NOT NULL,
  status               ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  rating               TINYINT NOT NULL, -- 1-5
  author_name          VARCHAR(120) NOT NULL DEFAULT 'Anonymous',
  review_text          TEXT NULL,
  -- Only meaningful when source = 'imported' - where this content actually
  -- came from, so the honest "Manufacturer review" label always traces back
  -- to something real, and disputed content can be pulled fast.
  source_url           VARCHAR(500) NULL,
  source_country       VARCHAR(80) NULL,
  -- Not populated yet (the "Verified Purchase" cross-check against
  -- product_funnel_events was deliberately deferred) - the column exists now
  -- so adding that later doesn't need a migration.
  is_verified_purchase TINYINT(1) NOT NULL DEFAULT 0,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  moderated_at         TIMESTAMP NULL,
  INDEX idx_product_status (product_id, status)
);

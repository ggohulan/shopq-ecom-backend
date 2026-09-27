-- Run this against whatever database your DB_NAME env var points to (it
-- does NOT hardcode/switch database, unlike the older per-table schema
-- files in this folder - those assume a name, `shopq_supplemental`, that
-- doesn't actually match the real production database name,
-- `sq_ecom_frontend_backend` - check your own .env before running this).
--
-- Product photo hosting - this backend is the source of truth for every
-- product image (replacing the CRM as the image source). The actual file
-- bytes live on disk (see src/lib/uploads.js, UPLOADS_DIR); only the
-- relative path is stored here, and it's served back through
-- GET /api/uploads/[...path], so moving storage location or domain never
-- needs a data migration.
CREATE TABLE IF NOT EXISTS product_images (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  product_id  VARCHAR(64) NOT NULL,
  -- Relative path under UPLOADS_DIR, e.g. "products/<uuid>.jpg" - never a
  -- full URL and never the client's original filename (avoids path
  -- traversal/collisions - see saveProductImage).
  file_path   VARCHAR(255) NOT NULL,
  -- Exactly one row per product_id should have is_primary = 1 - it's what
  -- listings/thumbnails show. Enforced in application code (see
  -- PATCH /api/product-images/[id]), not a DB constraint, since MySQL has
  -- no partial-unique-index equivalent to enforce "at most one true per
  -- product_id" directly.
  is_primary  TINYINT(1) NOT NULL DEFAULT 0,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product (product_id, sort_order)
);

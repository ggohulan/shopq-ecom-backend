-- Run this against whatever database your DB_NAME env var points to (see the
-- naming-drift note in product-images-schema.sql - same caveat applies).
--
-- Per-entity SEO overrides (products, categories, static pages) - see
-- HANDOVER-seo-management.md for the full spec this implements. An entity
-- with no row here just means "no override" (a normal state, not an error -
-- same pattern as product_content) - the storefront falls back to the
-- entity's own name/photo.
CREATE TABLE IF NOT EXISTS seo_meta (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  entity_type       ENUM('product', 'category', 'page') NOT NULL,
  -- product_id for products (matches product_content.product_id), category
  -- slug/id for categories, a fixed key (e.g. 'home', 'about-us') for static
  -- pages - see src/app/sitemap.js's STATIC_PAGES for the real page keys.
  entity_id         VARCHAR(64) NOT NULL,
  meta_title        VARCHAR(70) NULL,
  meta_description  VARCHAR(160) NULL,
  og_image_url      VARCHAR(500) NULL,
  canonical_url     VARCHAR(500) NULL,
  is_noindex        TINYINT(1) NOT NULL DEFAULT 0,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_entity (entity_type, entity_id)
);

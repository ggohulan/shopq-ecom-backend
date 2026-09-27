-- Run this against whatever database your DB_NAME env var points to (see the
-- note in product-images-schema.sql about the shopq_supplemental vs
-- sq_ecom_frontend_backend naming drift - same caveat applies here).
--
-- A local mirror of "which product IDs exist in the CRM, with enough detail
-- to browse/search them" - built because the CRM's own product LIST
-- endpoint (GET /products) is broken: it's stuck returning a fixed 23
-- results regardless of per_page, ids filter, or status filter, even though
-- the real catalog has 138+ products. Per-ID lookups (GET /products/{id})
-- work fine for every real ID, so src/lib/productIndexSync.js rebuilds this
-- table by probing IDs one at a time through that endpoint instead of
-- trusting the broken list endpoint - see BUG-REPORT-crm-products-list.md
-- for the full writeup to hand to whoever maintains the CRM.
--
-- This is a search/browse index only, refreshed at most daily - it is NOT
-- used to show authoritative price/stock anywhere a customer-facing page or
-- a real order/inventory decision depends on freshness. Read the row, don't
-- trust it as more current than `last_checked_at`.
CREATE TABLE IF NOT EXISTS product_index (
  product_id      VARCHAR(64) PRIMARY KEY,
  name            VARCHAR(500) NOT NULL,
  price            DECIMAL(10,2) NULL,
  selling_price    DECIMAL(10,2) NULL,
  thumbnail_url    VARCHAR(500) NULL,
  stock_status     VARCHAR(20) NULL,
  -- 'active' = last probe returned this product; 'missing' = last probe
  -- 404'd (deleted, or never existed) - kept as a row instead of deleted so
  -- a flaky single 404 doesn't need a special code path, it just flips back
  -- to 'active' next time this ID is probed and found again.
  status           ENUM('active', 'missing') NOT NULL DEFAULT 'active',
  last_checked_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status_name (status, name)
);

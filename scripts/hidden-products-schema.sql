-- Run this against whatever database your DB_NAME env var points to (same
-- caveat as product-images-schema.sql about the database name).
--
-- Products an admin has hidden from the storefront. A row = hidden; deleting
-- the row = visible again. The CRM is never touched: this backend only keeps
-- the list, serves it at GET /api/hidden-products, and the storefront drops
-- those product IDs from listings, search and product pages.
CREATE TABLE IF NOT EXISTS hidden_products (
  product_id  VARCHAR(64) PRIMARY KEY,
  hidden_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

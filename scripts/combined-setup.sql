-- ============================================================
-- ShopQ Admin Backend - full database setup, combined
-- Paste this whole file into phpMyAdmin's SQL tab and run it once.
-- Creates all 7 tables the admin backend needs, plus your login.
-- ============================================================

CREATE DATABASE IF NOT EXISTS shopq_supplemental;
USE shopq_supplemental;

-- ---------- 1. product_content ----------
-- Supplemental product detail page content (Features/Highlights/Key
-- Features/Ideal For/Why You'll Love It/Specifications) that the CRM
-- doesn't provide.
CREATE TABLE IF NOT EXISTS product_content (
  product_id     VARCHAR(64) PRIMARY KEY,
  features       JSON NULL,
  highlights     JSON NULL,
  key_features   JSON NULL,
  ideal_for      TEXT NULL,
  love_it        JSON NULL,
  specifications JSON NULL,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------- 2. promo_banners ----------
-- The two promo cards on the homepage.
CREATE TABLE IF NOT EXISTS promo_banners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  theme VARCHAR(20) NOT NULL DEFAULT 'blue',
  badge VARCHAR(60) NOT NULL DEFAULT '',
  headline VARCHAR(150) NOT NULL DEFAULT '',
  sub VARCHAR(255) NOT NULL DEFAULT '',
  cta_text VARCHAR(60) NOT NULL DEFAULT 'Shop now',
  link_type ENUM('product', 'url') NOT NULL DEFAULT 'product',
  link_value VARCHAR(255) NOT NULL DEFAULT '',
  image_url VARCHAR(500) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_active_order (is_active, sort_order)
);

-- ---------- 3. sidebar_promos ----------
-- The two sidebar promo cards next to the homepage product listing.
CREATE TABLE IF NOT EXISTS sidebar_promos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  card_type ENUM('goal_tracker', 'checklist') NOT NULL DEFAULT 'checklist',
  badge VARCHAR(60) NOT NULL DEFAULT '',
  headline_prefix VARCHAR(60) NOT NULL DEFAULT '',
  highlight VARCHAR(60) NOT NULL DEFAULT '',
  headline_suffix VARCHAR(60) NOT NULL DEFAULT '',
  start_label VARCHAR(30) NOT NULL DEFAULT '',
  mid_label VARCHAR(60) NOT NULL DEFAULT '',
  end_label VARCHAR(30) NOT NULL DEFAULT '',
  headline VARCHAR(150) NOT NULL DEFAULT '',
  checklist_json VARCHAR(500) NOT NULL DEFAULT '[]',
  cta_text VARCHAR(60) NOT NULL DEFAULT 'Add to cart',
  image_url VARCHAR(500) NOT NULL DEFAULT '',
  product_id VARCHAR(64) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_active_order (is_active, sort_order)
);

-- ---------- 4. site_offer ----------
-- The site-wide "20% off / SHOPQ20" first-order offer. Singleton - always
-- exactly one row, id fixed at 1.
CREATE TABLE IF NOT EXISTS site_offer (
  id INT PRIMARY KEY DEFAULT 1,
  discount_label VARCHAR(20) NOT NULL DEFAULT '20%',
  code VARCHAR(30) NOT NULL DEFAULT 'SHOPQ20',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------- 5. product_funnel_events ----------
-- View / add-to-cart / remove / checkout-start / purchase log, powers
-- the funnel and cart-abandonment admin reports.
CREATE TABLE IF NOT EXISTS product_funnel_events (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id     VARCHAR(64) NOT NULL,
  variation_id   VARCHAR(64) NULL,
  event_type     ENUM('view','add_to_cart','remove_from_cart','checkout_start','purchase') NOT NULL,
  session_id     VARCHAR(64) NOT NULL,
  consumer_id    VARCHAR(64) NULL,
  source         VARCHAR(32) NULL,
  quantity       INT NULL,
  price_at_event DECIMAL(10,2) NULL,
  order_id       VARCHAR(64) NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_report (product_id, event_type, created_at),
  INDEX idx_session (session_id, event_type, created_at)
);

-- ---------- 6. admin_users ----------
-- Real login for the admin pages (username/email + bcrypt-hashed password).
CREATE TABLE IF NOT EXISTS admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------- 7. Your admin login ----------
-- username: admin | email: admin@gmail.com | password: admin123
-- Password is already bcrypt-hashed below - never stored as plain text.
-- CHANGE THIS PASSWORD once you've confirmed login works - see
-- scripts/seed-admin-user.js to generate a new hash for a different one.
INSERT INTO admin_users (username, email, password_hash)
VALUES ('admin', 'admin@gmail.com', '$2a$12$0qpuYGi7COXeSk/tgwierua19RagEwQppU7gh4ZIPyg17aTLiBoNu')
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);

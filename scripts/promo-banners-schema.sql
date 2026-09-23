-- Promo banner cards shown on the homepage (src/components/parisTheme/PromoBanners.jsx).
-- Replaces the two hardcoded banners with an admin-editable list.
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

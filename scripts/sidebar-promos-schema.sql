-- Sidebar promo cards shown on the homepage next to the product listing
-- (src/components/parisTheme/SidebarPromo.jsx). Two card templates exist
-- (goal_tracker: progress bar + start/mid/end labels; checklist: ticked
-- benefit list) - card_type picks which fields apply. Both are stored on
-- one row per card rather than two tables, matching how the component
-- already keeps both templates in one array with optional fields.
CREATE TABLE IF NOT EXISTS sidebar_promos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  card_type ENUM('goal_tracker', 'checklist') NOT NULL DEFAULT 'checklist',
  badge VARCHAR(60) NOT NULL DEFAULT '',
  -- goal_tracker only
  headline_prefix VARCHAR(60) NOT NULL DEFAULT '',
  highlight VARCHAR(60) NOT NULL DEFAULT '',
  headline_suffix VARCHAR(60) NOT NULL DEFAULT '',
  start_label VARCHAR(30) NOT NULL DEFAULT '',
  mid_label VARCHAR(60) NOT NULL DEFAULT '',
  end_label VARCHAR(30) NOT NULL DEFAULT '',
  -- checklist only
  headline VARCHAR(150) NOT NULL DEFAULT '',
  checklist_json VARCHAR(500) NOT NULL DEFAULT '[]',
  -- shared
  cta_text VARCHAR(60) NOT NULL DEFAULT 'Add to cart',
  image_url VARCHAR(500) NOT NULL DEFAULT '',
  product_id VARCHAR(64) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_active_order (is_active, sort_order)
);

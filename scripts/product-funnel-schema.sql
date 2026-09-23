USE shopq_supplemental;

CREATE TABLE IF NOT EXISTS product_funnel_events (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id     VARCHAR(64) NOT NULL,
  variation_id   VARCHAR(64) NULL,
  event_type     ENUM('view','add_to_cart','remove_from_cart','checkout_start','purchase') NOT NULL,
  session_id     VARCHAR(64) NOT NULL,   -- reuses cart_token, see src/utils/cartToken.js
  consumer_id    VARCHAR(64) NULL,       -- set once logged in, links a guest's earlier events to their account
  source         VARCHAR(32) NULL,       -- product_page, card, popup, bundle, buy_now
  quantity       INT NULL,
  price_at_event DECIMAL(10,2) NULL,     -- price when the event fired, not looked up later
  order_id       VARCHAR(64) NULL,       -- set on purchase, joins to the CRM order
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_report (product_id, event_type, created_at),
  INDEX idx_session (session_id, event_type, created_at)
);

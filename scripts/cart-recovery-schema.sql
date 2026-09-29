-- Run this against whatever database your DB_NAME env var points to (see the
-- naming-drift note in product-images-schema.sql - same caveat applies).
--
-- Tracks which recovery email "step" (1/2/3, see src/lib/cartRecovery.js)
-- has already been sent for a given abandoned session - the only state this
-- feature needs of its own, since which carts are abandoned and whether they
-- later converted is derived entirely from the existing product_funnel_events
-- table, not duplicated here.
CREATE TABLE IF NOT EXISTS cart_recovery_log (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  session_id   VARCHAR(64) NOT NULL,
  consumer_id  VARCHAR(64) NOT NULL,
  email        VARCHAR(255) NOT NULL,
  -- 1 = 1hr reminder, 2 = 24hr objection-handling, 3 = 72hr discount - see
  -- the "Cart Recovery Proposal" artifact for why these three specifically.
  step         TINYINT NOT NULL,
  sent_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- One send per session per step, ever - the sweep uses INSERT IGNORE
  -- against this so a session can never be emailed the same step twice,
  -- even if the sweep runs more than once before the next step's window.
  UNIQUE KEY idx_session_step (session_id, step),
  INDEX idx_consumer (consumer_id)
);

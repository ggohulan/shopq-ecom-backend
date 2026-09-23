CREATE DATABASE IF NOT EXISTS shopq_supplemental;
USE shopq_supplemental;

CREATE TABLE IF NOT EXISTS product_content (
  product_id     VARCHAR(64) PRIMARY KEY,
  -- Short bullet list shown right under the price on the product detail
  -- page (ProductFeaturesList) - distinct from `highlights` (ProductHighlights,
  -- driven by the CRM description's "Highlights"/"Features" heading when
  -- present) and `key_features` (the boxed cards in the Description tab).
  features       JSON NULL,
  highlights     JSON NULL,
  key_features   JSON NULL,
  ideal_for      TEXT NULL,
  -- Pills, e.g. "Fits both cylinder sizes" (RichDescriptionSections' love-it-pills).
  love_it        JSON NULL,
  -- Array of { label, value } rows (RichDescriptionSections' specifications-table).
  specifications JSON NULL,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Run these if you already created the table before these columns were added:
-- ALTER TABLE product_content ADD COLUMN features JSON NULL AFTER product_id;
-- ALTER TABLE product_content ADD COLUMN love_it JSON NULL AFTER ideal_for;
-- ALTER TABLE product_content ADD COLUMN specifications JSON NULL AFTER love_it;

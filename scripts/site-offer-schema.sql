-- The site-wide "20% off / SHOPQ20" first-order offer, previously duplicated
-- as a hardcoded OFFER const in both src/components/parisTheme/OfferHero.jsx
-- and src/layout/exitModal/index.jsx (src/components/parisTheme/NewsLetter.jsx
-- already imported OfferHero's copy, so it follows automatically). Singleton
-- table - always exactly one row, id fixed at 1.
CREATE TABLE IF NOT EXISTS site_offer (
  id INT PRIMARY KEY DEFAULT 1,
  discount_label VARCHAR(20) NOT NULL DEFAULT '20%',
  code VARCHAR(30) NOT NULL DEFAULT 'SHOPQ20',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

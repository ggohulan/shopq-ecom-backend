-- Real login (username/email + password) for the admin pages, replacing the
-- two shared static tokens (ADMIN_CONTENT_TOKEN / ANALYTICS_ADMIN_TOKEN).
-- One unified account grants access to every admin page. Passwords are
-- always bcrypt-hashed - see scripts/seed-admin-user.js for how the seed
-- row below actually gets its password_hash value.
CREATE TABLE IF NOT EXISTS admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

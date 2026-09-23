// One-off local script: hashes a password with bcrypt and prints the INSERT
// statement to run against the database - never writes a plaintext password
// into a .sql file that might end up committed. Usage:
//   node scripts/seed-admin-user.js <username> <email> <password>
const bcrypt = require('bcryptjs');

const [, , username, email, password] = process.argv;
if (!username || !email || !password) {
  console.error('Usage: node scripts/seed-admin-user.js <username> <email> <password>');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
const esc = (s) => s.replace(/'/g, "''");
console.log(
  `INSERT INTO admin_users (username, email, password_hash) VALUES ('${esc(username)}', '${esc(email)}', '${hash}');`
);

// Runs a .sql file against the database in .env.local (the same DB_* settings
// the app uses), so a schema change on the server needs no phpMyAdmin and no
// typing of the database password. Prints no settings. Usage, from the app
// folder:
//   node scripts/run-sql.js scripts/hidden-products-schema.sql
const fs = require('fs');
const mysql = require('mysql2/promise');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('Usage: node scripts/run-sql.js <file.sql>');
  process.exit(1);
}

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });
  await conn.query(fs.readFileSync(file, 'utf8'));
  await conn.end();
  console.log(`Done: ${file}`);
})().catch((e) => {
  console.error('Failed:', e.code || e.message);
  process.exit(1);
});

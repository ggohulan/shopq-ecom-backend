// One-off repair: em dashes in product_content that were double-encoded and
// read back as "ÔÇö". Dry run by default; pass --apply to write. Run from the
// repo root on the server, where .env.local holds the DB credentials.
const fs = require('fs');
const mysql = require('mysql2/promise');

const GARBLED = '\u00d4\u00c7\u00f6';
const DASH = '\u2014';
const COLUMNS = ['features', 'highlights', 'key_features', 'ideal_for', 'love_it', 'specifications'];

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    })
);
const apply = process.argv.includes('--apply');

(async () => {
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    charset: 'utf8mb4',
  });
  const [rows] = await conn.query('SELECT * FROM product_content');

  for (const row of rows) {
    const updates = {};
    for (const col of COLUMNS) {
      const value = row[col];
      if (value == null) continue;
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      if (text.includes(GARBLED)) updates[col] = text.split(GARBLED).join(DASH);
    }
    const cols = Object.keys(updates);
    if (!cols.length) continue;

    console.log(`product ${row.product_id}: ${cols.join(', ')}`);
    if (apply) {
      await conn.query(
        `UPDATE product_content SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE product_id = ?`,
        [...cols.map((c) => updates[c]), row.product_id]
      );
    }
  }

  console.log(apply ? 'Applied.' : 'Dry run only - re-run with --apply to write.');
  await conn.end();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});

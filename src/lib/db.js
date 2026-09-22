import mysql from 'mysql2/promise';

// Cached on `global` so Next.js dev-mode hot reload doesn't create a new
// connection pool (and leak connections) on every file change - standard
// pattern for reusing a DB pool across serverless/dev invocations.
const globalForDb = global;

function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
    // Off by default (matches local XAMPP/MariaDB, which has no TLS) - hosted
    // MySQL providers (PlanetScale, Railway, Aiven, DigitalOcean, RDS, etc.)
    // almost all require it. Set DB_SSL=true in that environment's env vars
    // to turn it on; nothing changes locally unless that var is set there too.
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
  });
}

export function getDbPool() {
  if (!globalForDb.__shopqSupplementalPool) {
    globalForDb.__shopqSupplementalPool = createPool();
  }
  return globalForDb.__shopqSupplementalPool;
}

// src/lib/productIndexSync.js
//
// Rebuilds product_index by probing the CRM's per-product endpoint
// (GET /products/{id}) directly, one ID at a time, instead of trusting the
// CRM's product LIST endpoint (GET /products) - that one is broken, stuck
// returning a fixed 23 results regardless of per_page, the `ids` filter, or
// the status filter, even though the real catalog has 138+ products.
// GET /products/{id} works reliably for every real ID (see
// BUG-REPORT-crm-products-list.md for the full investigation), so this is
// the resilient path - it just costs one request per ID instead of one
// request per page, which is why this runs as a slow background sync
// (src/instrumentation.js) rather than on-demand per page view.
import { getDbPool } from '@/lib/db';

const RAW_BASE = (process.env.LARAVEL_API_BASE_URL || '').replace(/\/$/, '');

function normalizeImageUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const fixed = url.replace(/^\/?api\/v1\/storage/i, '/uploads').replace(/^\/?storage/i, '/uploads');
  try {
    const origin = new URL(RAW_BASE).origin;
    return fixed.startsWith('/') ? origin + fixed : origin + '/' + fixed;
  } catch (e) {
    return fixed;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetches one product by ID. Returns { found: true, product } on a real
// 200, { found: false } on 404 (no such product), or throws for anything
// else (network error, 429, 5xx) so the caller decides how to back off.
async function fetchOne(id) {
  const res = await fetch(`${RAW_BASE}/products/${id}`, { signal: AbortSignal.timeout(10000) });
  if (res.status === 404) return { found: false };
  if (!res.ok) {
    const err = new Error(`CRM returned ${res.status} for product ${id}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json().catch(() => null);
  const product = body?.data ?? body;
  if (!product?.name) return { found: false };
  return {
    found: true,
    product: {
      id: String(product.id ?? id),
      name: product.name ?? product.product_name,
      // The per-product endpoint's field names differ from the (broken)
      // list endpoint's: `cost_price`/`selling_price` here, vs `price`/
      // `sale_price` there (see /api/product/route.js). Confirmed by
      // fetching a real product directly - selling_price is what the admin
      // UI actually displays and is never null for a real product.
      price: product.cost_price ?? null,
      sellingPrice: product.selling_price ?? product.effective_price ?? null,
      thumbnailUrl: normalizeImageUrl(product?.product_thumbnail?.original_url) || null,
      stockStatus: product.stock_status || (Number(product.quantity || 0) > 0 ? 'in_stock' : 'out_of_stock'),
    },
  };
}

async function upsertActive(pool, p) {
  await pool.query(
    `INSERT INTO product_index (product_id, name, price, selling_price, thumbnail_url, stock_status, status, last_checked_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())
     ON DUPLICATE KEY UPDATE
       name = VALUES(name), price = VALUES(price), selling_price = VALUES(selling_price),
       thumbnail_url = VALUES(thumbnail_url), stock_status = VALUES(stock_status),
       status = 'active', last_checked_at = NOW()`,
    [p.id, p.name, p.price, p.sellingPrice, p.thumbnailUrl, p.stockStatus]
  );
}

// Only flips a row that already exists to 'missing' (0 rows affected if
// this ID was never a real product) - otherwise probing IDs 1-1000 would
// insert a row for every one of the ~860 IDs that never existed, just to
// record "nothing here", which is pointless bloat.
async function markMissing(pool, id) {
  await pool.query(`UPDATE product_index SET status = 'missing', last_checked_at = NOW() WHERE product_id = ?`, [String(id)]);
}

// Tracked on `global` for the same hot-reload-survival reason as the DB
// pool in src/lib/db.js - lets the manual "Sync now" button and the status
// endpoint see whether the scheduled background run is already in flight,
// and stops the two from ever running concurrently against the CRM.
const globalForSync = global;

export function getSyncStatus() {
  return globalForSync.__shopqProductIndexSyncStatus || { running: false, lastSummary: null };
}

// Probes IDs [from, to] sequentially with a delay between requests (default
// paced so 1000 IDs takes roughly 15 minutes) - concurrency without a delay
// hit the CRM's rate limit (429) after about 50 requests during testing.
// A 429 is retried with exponential backoff rather than counted as a miss.
export async function runProductIndexSync({ from = 1, to = 1000, delayMs } = {}) {
  if (globalForSync.__shopqProductIndexSyncStatus?.running) {
    throw new Error('A sync is already running');
  }
  globalForSync.__shopqProductIndexSyncStatus = { running: true, lastSummary: getSyncStatus().lastSummary };

  const pool = getDbPool();
  const pacing = Number.isFinite(Number(delayMs)) ? Number(delayMs) : Number(process.env.PRODUCT_INDEX_SYNC_DELAY_MS) || 800;
  const summary = { from, to, checked: 0, active: 0, missing: 0, errors: 0, startedAt: new Date().toISOString() };

  try {
    for (let id = from; id <= to; id += 1) {
      let attempt = 0;
      let backoff = 2000;

      for (;;) {
        try {
          const result = await fetchOne(id);
          if (result.found) {
            await upsertActive(pool, result.product);
            summary.active += 1;
          } else {
            await markMissing(pool, id);
            summary.missing += 1;
          }
          break;
        } catch (err) {
          if (err.status === 429 && attempt < 5) {
            attempt += 1;
            await sleep(backoff);
            backoff = Math.min(backoff * 2, 30000);
            continue;
          }
          console.error(`[product-index-sync] failed for id ${id}:`, err.message);
          summary.errors += 1;
          break;
        }
      }

      summary.checked += 1;
      if (id < to) await sleep(pacing);
    }

    summary.finishedAt = new Date().toISOString();
    console.log('[product-index-sync] done', summary);
    return summary;
  } finally {
    globalForSync.__shopqProductIndexSyncStatus = { running: false, lastSummary: summary };
  }
}

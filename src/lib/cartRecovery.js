// src/lib/cartRecovery.js
//
// Finds abandoned carts (reusing the same detection logic as
// src/app/api/cart-abandonment/route.js) and, for the ones with a known
// consumer (a logged-in shopper - see the "one known gap" callout below),
// sends the next email in the 3-step sequence from the "Cart Recovery
// Proposal" artifact. Runs on a schedule from src/instrumentation.js, same
// pattern as productIndexSync.js.
//
// The one real limitation, same one flagged in that artifact: a guest
// checkout with no account has no email on file anywhere this backend can
// reach, so guest carts show up in the Abandoned Carts report but are never
// emailed. Nothing here can fix that without the storefront capturing an
// email earlier in its guest flow, which is out of scope for this pass.
import { getDbPool } from '@/lib/db';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import { buildRecoveryEmail } from '@/lib/cartRecoveryEmails';

const LARAVEL_API_BASE = (process.env.LARAVEL_API_BASE_URL || '').replace(/\/$/, '');

// Hours since the cart's last activity before each step fires. Step 2 and 3
// also require the previous step to have already been sent - see the
// eligibility check in runCartRecoverySweep below.
export const STEP_HOURS = { 1: 1, 2: 24, 3: 72 };

// Same abandonment definition as /api/cart-abandonment (not removed
// afterwards, not purchased afterwards by session or consumer_id), grouped
// to one row per session instead of one row per item, and restricted to
// sessions with a consumer_id - a guest session has no address to send to
// so there is nothing for the sweep to do with it.
const CANDIDATES_SQL = `
  SELECT session_id, consumer_id, MAX(created_at) AS last_activity,
         SUM(price_at_event * quantity) AS cart_value,
         GROUP_CONCAT(DISTINCT product_id) AS product_ids
  FROM (
    SELECT a.session_id, a.consumer_id, a.product_id, a.price_at_event, a.quantity, a.created_at
    FROM product_funnel_events a
    WHERE a.event_type = 'add_to_cart'
      AND a.consumer_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM product_funnel_events r
        WHERE r.event_type = 'remove_from_cart' AND r.session_id = a.session_id
          AND r.product_id = a.product_id AND r.created_at > a.created_at
      )
      AND NOT EXISTS (
        SELECT 1 FROM product_funnel_events p
        WHERE p.event_type = 'purchase' AND p.created_at > a.created_at
          AND (p.session_id = a.session_id OR p.consumer_id = a.consumer_id)
      )
  ) items
  GROUP BY session_id, consumer_id
  HAVING MAX(created_at) < NOW() - INTERVAL ? HOUR
`;

async function resolveConsumer(consumerId) {
  if (!LARAVEL_API_BASE || !consumerId) return null;
  try {
    const res = await fetch(`${LARAVEL_API_BASE}/self?consumer_id=${encodeURIComponent(consumerId)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const data = body && Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body;
    if (!data?.email) return null;
    return { email: data.email, name: data.name || data.full_name || data.username || null };
  } catch (e) {
    return null;
  }
}

async function resolveProductDetails(pool, productIds) {
  if (!productIds.length) return new Map();
  const placeholders = productIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT product_id, name, selling_price FROM product_index WHERE product_id IN (${placeholders})`,
    productIds
  );
  return new Map(rows.map((r) => [String(r.product_id), { name: r.name, price: r.selling_price }]));
}

async function getCurrentOffer(pool) {
  try {
    const [rows] = await pool.query('SELECT discount_label, code FROM site_offer WHERE id = 1');
    return rows[0] ? { discountLabel: rows[0].discount_label, code: rows[0].code } : null;
  } catch (e) {
    return null;
  }
}

// Which step (if any) this session is due for right now, given which steps
// it's already had. Steps must happen in order - step 2 never fires before
// step 1 has actually been sent, even if the cart is already 24h+ old (e.g.
// the sweep was down for a while), since step 2's content assumes step 1
// already happened.
function nextEligibleStep(sentSteps, ageHours) {
  if (!sentSteps.has(1) && ageHours >= STEP_HOURS[1]) return 1;
  if (sentSteps.has(1) && !sentSteps.has(2) && ageHours >= STEP_HOURS[2]) return 2;
  if (sentSteps.has(2) && !sentSteps.has(3) && ageHours >= STEP_HOURS[3]) return 3;
  return null;
}

const globalForRecovery = global;

export function getCartRecoveryStatus() {
  return globalForRecovery.__shopqCartRecoveryStatus || { running: false, lastSummary: null };
}

export async function runCartRecoverySweep() {
  if (globalForRecovery.__shopqCartRecoveryStatus?.running) {
    throw new Error('A sweep is already running');
  }
  globalForRecovery.__shopqCartRecoveryStatus = { running: true, lastSummary: getCartRecoveryStatus().lastSummary };

  const summary = { checked: 0, sent: 0, skippedNoEmail: 0, skippedNotConfigured: 0, errors: 0, startedAt: new Date().toISOString() };

  if (!isEmailConfigured()) {
    summary.skippedNotConfigured = 1;
    summary.finishedAt = new Date().toISOString();
    globalForRecovery.__shopqCartRecoveryStatus = { running: false, lastSummary: summary };
    return summary;
  }

  const pool = getDbPool();
  try {
    // The smallest threshold (step 1) is the widest net - anything eligible
    // for step 2/3 is necessarily also older than this.
    const [candidates] = await pool.query(CANDIDATES_SQL, [STEP_HOURS[1]]);
    const offer = await getCurrentOffer(pool);

    for (const row of candidates) {
      summary.checked += 1;
      const ageHours = (Date.now() - new Date(row.last_activity).getTime()) / 3600000;

      const [sentRows] = await pool.query('SELECT step FROM cart_recovery_log WHERE session_id = ?', [row.session_id]);
      const sentSteps = new Set(sentRows.map((r) => r.step));
      const step = nextEligibleStep(sentSteps, ageHours);
      if (!step) continue;

      const contact = await resolveConsumer(row.consumer_id);
      if (!contact?.email) {
        summary.skippedNoEmail += 1;
        continue;
      }

      try {
        const productIds = String(row.product_ids || '').split(',').filter(Boolean);
        const detailsByProduct = await resolveProductDetails(pool, productIds);
        const items = productIds.map((id) => {
          const details = detailsByProduct.get(id);
          return { productId: id, name: details?.name || null, price: details?.price ?? null };
        });
        const cartValue = row.cart_value != null ? Number(row.cart_value) : null;

        const { subject, html } = await buildRecoveryEmail(step, { name: contact.name, items, cartValue, offer });
        await sendEmail({ to: contact.email, subject, html });

        // INSERT IGNORE, not INSERT - the unique (session_id, step) key means
        // a session can never be emailed the same step twice even if two
        // sweeps somehow overlap.
        await pool.query('INSERT IGNORE INTO cart_recovery_log (session_id, consumer_id, email, step) VALUES (?, ?, ?, ?)', [
          row.session_id,
          row.consumer_id,
          contact.email,
          step,
        ]);
        summary.sent += 1;
      } catch (err) {
        console.error('[cart-recovery] failed to send', { sessionId: row.session_id, step, error: err.message });
        summary.errors += 1;
      }
    }

    summary.finishedAt = new Date().toISOString();
    console.log('[cart-recovery] sweep done', summary);
    return summary;
  } finally {
    globalForRecovery.__shopqCartRecoveryStatus = { running: false, lastSummary: summary };
  }
}

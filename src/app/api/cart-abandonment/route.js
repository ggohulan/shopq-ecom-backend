// app/api/cart-abandonment/route.js
//
// GET only, admin-token protected. Reuses product_funnel_events (item 1) -
// no new table. Fixes the three logic holes the review found in the first
// draft's query:
//   1. NOT IN had no time window -> anyone who ever purchased anything was
//      excluded forever. Fixed: only exclude a purchase for the SAME
//      session that happened AFTER the add-to-cart and inside the window.
//   2. No remove event -> items taken back out still counted as abandoned.
//      Fixed: exclude a session/product pair with a later remove_from_cart.
//   3. A guest who logs in before paying changes ID -> purchase never
//      matched their earlier add-to-cart. Fixed: also check for a purchase
//      under the same consumer_id (not just the same session_id), for
//      sessions that have one.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';

const DEFAULT_WINDOW_HOURS = 6;

export async function GET(request) {
  const auth = checkAdminToken(request, 'ANALYTICS_ADMIN_TOKEN');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const windowHours = Math.min(168, Math.max(1, Number(searchParams.get('windowHours')) || DEFAULT_WINDOW_HOURS));

  try {
    const pool = getDbPool();
    const [rows] = await pool.query(
      `SELECT a.session_id, a.consumer_id, a.product_id, a.variation_id, a.quantity, a.price_at_event, a.created_at
       FROM product_funnel_events a
       WHERE a.event_type = 'add_to_cart'
         AND a.created_at < NOW() - INTERVAL ? HOUR
         -- (1) not removed afterwards
         AND NOT EXISTS (
           SELECT 1 FROM product_funnel_events r
           WHERE r.event_type = 'remove_from_cart' AND r.session_id = a.session_id AND r.product_id = a.product_id AND r.created_at > a.created_at
         )
         -- (2 & 3) not purchased afterwards, by session OR by consumer_id
         AND NOT EXISTS (
           SELECT 1 FROM product_funnel_events p
           WHERE p.event_type = 'purchase' AND p.created_at > a.created_at
             AND (p.session_id = a.session_id OR (a.consumer_id IS NOT NULL AND p.consumer_id = a.consumer_id))
         )
       ORDER BY a.created_at DESC
       LIMIT 200`,
      [windowHours]
    );

    const carts = rows.map((r) => ({
      sessionId: r.session_id,
      consumerId: r.consumer_id,
      productId: r.product_id,
      variationId: r.variation_id,
      quantity: Number(r.quantity) || 0,
      priceAtEvent: r.price_at_event != null ? Number(r.price_at_event) : null,
      value: r.price_at_event != null ? Number(r.price_at_event) * (Number(r.quantity) || 0) : null,
      abandonedAt: r.created_at,
      hasContact: !!r.consumer_id, // guests have only an anonymous session_id - nobody to follow up with
    }));

    return NextResponse.json({ windowHours, carts });
  } catch (err) {
    console.error('[cart-abandonment] failed', err);
    return NextResponse.json({ error: 'Could not load abandoned carts' }, { status: 500 });
  }
}

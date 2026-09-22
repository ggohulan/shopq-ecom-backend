// app/api/funnel-report/route.js
//
// GET only, admin-token protected (this is business data, unlike the
// public GET on /api/product-content). Returns the per-product funnel
// breakdown for the admin page - unique visitors per stage (distinct
// session_id), not raw event counts, per review feedback.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';

export async function GET(request) {
  const auth = checkAdminToken(request, 'ANALYTICS_ADMIN_TOKEN');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const days = Math.min(365, Math.max(1, Number(searchParams.get('days')) || 30));

  try {
    const pool = getDbPool();

    const [rows] = await pool.query(
      `SELECT
         product_id,
         COUNT(DISTINCT CASE WHEN event_type = 'view' THEN session_id END) AS views,
         COUNT(DISTINCT CASE WHEN event_type = 'add_to_cart' THEN session_id END) AS add_to_carts,
         COUNT(DISTINCT CASE WHEN event_type = 'checkout_start' THEN session_id END) AS checkout_starts,
         COUNT(DISTINCT CASE WHEN event_type = 'purchase' THEN session_id END) AS purchases,
         SUM(CASE WHEN event_type = 'purchase' THEN quantity ELSE 0 END) AS units_sold,
         SUM(CASE WHEN event_type = 'purchase' THEN price_at_event * quantity ELSE 0 END) AS revenue
       FROM product_funnel_events
       WHERE created_at >= NOW() - INTERVAL ? DAY
       GROUP BY product_id
       ORDER BY views DESC`,
      [days]
    );

    // Verification panel: this week's logged purchase count, to check
    // against the CRM's real order count by eye - trust, don't just believe.
    const [[weekly]] = await pool.query(
      `SELECT COUNT(DISTINCT order_id) AS logged_orders_last_7_days
       FROM product_funnel_events
       WHERE event_type = 'purchase' AND created_at >= NOW() - INTERVAL 7 DAY AND order_id IS NOT NULL`
    );

    const data = rows.map((r) => {
      const views = Number(r.views) || 0;
      const addToCarts = Number(r.add_to_carts) || 0;
      const purchases = Number(r.purchases) || 0;
      return {
        productId: r.product_id,
        views,
        addToCarts,
        checkoutStarts: Number(r.checkout_starts) || 0,
        purchases,
        unitsSold: Number(r.units_sold) || 0,
        revenue: Number(r.revenue) || 0,
        viewToCartRate: views ? addToCarts / views : null,
        cartToBuyRate: addToCarts ? purchases / addToCarts : null,
      };
    });

    return NextResponse.json({ days, products: data, loggedOrdersLast7Days: Number(weekly?.logged_orders_last_7_days) || 0 });
  } catch (err) {
    console.error('[funnel-report] failed', err);
    return NextResponse.json({ error: 'Could not load report' }, { status: 500 });
  }
}

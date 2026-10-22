// app/api/hidden-products/route.js
//
// Which products are hidden from the storefront - see
// scripts/hidden-products-schema.sql. GET is public and unauthenticated (the
// storefront reads it to drop these IDs from listings, search and product
// pages; it is just a list of IDs). PUT is the only write path, admin-gated,
// and hides or shows a batch of products in one call.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const MAX_IDS = 500;

export async function GET() {
  try {
    const [rows] = await getDbPool().query('SELECT product_id FROM hidden_products');
    return NextResponse.json({ ids: rows.map((r) => String(r.product_id)) }, { headers: { 'Cache-Control': 'public, max-age=30' } });
  } catch (err) {
    // Fail open: if the list cannot be read, the shop keeps showing everything
    // instead of going blank.
    console.error('[hidden-products] GET failed', err);
    return NextResponse.json({ ids: [] });
  }
}

// PUT { productIds: ['12', '40'], hidden: true | false }
export async function PUT(request) {
  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body?.hidden !== 'boolean' || !Array.isArray(body?.productIds)) {
    return NextResponse.json({ error: 'hidden (true/false) and productIds (a list) are required' }, { status: 422 });
  }
  const ids = [...new Set(body.productIds.map((id) => String(id ?? '').trim()))];
  if (!ids.length || ids.length > MAX_IDS || ids.some((id) => !id || id.length > 64)) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_IDS} product ids` }, { status: 422 });
  }

  try {
    const pool = getDbPool();
    if (body.hidden) {
      await pool.query(`INSERT IGNORE INTO hidden_products (product_id) VALUES ${ids.map(() => '(?)').join(',')}`, ids);
    } else {
      await pool.query(`DELETE FROM hidden_products WHERE product_id IN (${ids.map(() => '?').join(',')})`, ids);
    }
    return NextResponse.json({ ok: true, hidden: body.hidden, count: ids.length });
  } catch (err) {
    console.error('[hidden-products] PUT failed', err);
    return NextResponse.json({ error: 'Could not update the hidden products' }, { status: 500 });
  }
}

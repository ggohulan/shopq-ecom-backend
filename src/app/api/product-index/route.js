// app/api/product-index/route.js
//
// A reliable stand-in for the CRM's broken product LIST endpoint - see
// src/lib/productIndexSync.js and BUG-REPORT-crm-products-list.md. Reads
// from the local product_index table (kept fresh by a daily background
// sync), not a live CRM call, so pagination/search/`ids` filtering all
// actually work, unlike GET /products on the CRM itself.
//
// This is a search/browse index only - price/stock shown here can be up to
// a day stale (whatever the last sync saw). Fine for "find a product to
// edit its content/images for"; nothing customer-facing reads this.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

function serialize(row) {
  return {
    id: row.product_id,
    name: row.name,
    price: row.price,
    selling_price: row.selling_price,
    product_thumbnail: { original_url: row.thumbnail_url || null },
    stock_status: row.stock_status,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids');
  const search = (searchParams.get('search') || '').trim();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const perPage = Math.min(200, Math.max(1, Number(searchParams.get('per_page')) || 40));

  const pool = getDbPool();

  try {
    // Matches the shape funnel/page.js and cart-abandonment/page.js already
    // expect from /api/product's `ids=` lookup - kept identical on purpose
    // so switching those callers over was a one-line URL change.
    if (idsParam) {
      const ids = idsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!ids.length) return NextResponse.json({ data: [], total: 0 });

      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await pool.query(`SELECT * FROM product_index WHERE product_id IN (${placeholders})`, ids);
      const data = rows.map(serialize);
      return NextResponse.json({ data, total: data.length, current_page: 1, per_page: data.length || 1 });
    }

    const where = ['status = "active"'];
    const params = [];
    if (search) {
      where.push('name LIKE ?');
      params.push(`%${search}%`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM product_index ${whereSql}`, params);
    const [rows] = await pool.query(`SELECT * FROM product_index ${whereSql} ORDER BY name ASC LIMIT ? OFFSET ?`, [
      ...params,
      perPage,
      (page - 1) * perPage,
    ]);

    return NextResponse.json({
      data: rows.map(serialize),
      total: Number(total),
      current_page: page,
      per_page: perPage,
    });
  } catch (err) {
    console.error('[product-index] GET failed', err);
    return NextResponse.json({ data: [], total: 0 });
  }
}

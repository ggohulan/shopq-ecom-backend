// app/api/reviews/route.js
//
// One table backs both review sources (imported + customer) - see
// scripts/reviews-schema.sql. GET is public by default and returns only
// approved reviews plus a rating aggregate for a product (what the
// storefront would eventually show); ?all=1 with a valid admin token also
// returns pending/rejected ones, for the moderation queue. POST is the
// public customer-submission path - every submission lands as 'pending',
// never visible until an admin approves it.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function serialize(row) {
  return {
    id: row.id,
    productId: row.product_id,
    source: row.source,
    status: row.status,
    rating: row.rating,
    authorName: row.author_name,
    reviewText: row.review_text,
    sourceUrl: row.source_url,
    sourceCountry: row.source_country,
    isVerifiedPurchase: !!row.is_verified_purchase,
    createdAt: row.created_at,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');
  const wantsAll = searchParams.get('all') === '1';
  const auth = wantsAll ? checkAdminToken(request) : { ok: false };

  const pool = getDbPool();

  try {
    if (wantsAll && auth.ok) {
      const statusFilter = searchParams.get('status');
      const where = [];
      const params = [];
      if (productId) {
        where.push('product_id = ?');
        params.push(productId);
      }
      if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
        where.push('status = ?');
        params.push(statusFilter);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const [rows] = await pool.query(`SELECT * FROM reviews ${whereSql} ORDER BY created_at DESC LIMIT 300`, params);
      return NextResponse.json({ reviews: rows.map(serialize) });
    }

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 });
    }

    const [rows] = await pool.query(
      'SELECT * FROM reviews WHERE product_id = ? AND status = "approved" ORDER BY created_at DESC',
      [productId]
    );
    const count = rows.length;
    const average = count ? rows.reduce((sum, r) => sum + r.rating, 0) / count : null;

    return NextResponse.json({
      reviews: rows.map(serialize),
      aggregate: { count, average: average != null ? Math.round(average * 10) / 10 : null },
    });
  } catch (err) {
    console.error('[reviews] GET failed', err);
    return NextResponse.json({ reviews: [] });
  }
}

// Public submission - the real review-collection path. Deliberately no
// admin token required (customers aren't signed in), which is exactly why
// this always inserts as 'pending' rather than trusting the input.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const productId = String(body.productId || '').trim();
  const rating = Math.round(Number(body.rating));
  const authorName = String(body.authorName || '').trim().slice(0, 120) || 'Anonymous';
  const reviewText = String(body.reviewText || '').trim().slice(0, 5000);

  if (!productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 });
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'rating must be a number from 1 to 5' }, { status: 400 });
  }
  if (!reviewText) return NextResponse.json({ error: 'reviewText is required' }, { status: 400 });

  try {
    const pool = getDbPool();
    const [result] = await pool.query(
      `INSERT INTO reviews (product_id, source, status, rating, author_name, review_text)
       VALUES (?, 'customer', 'pending', ?, ?, ?)`,
      [productId, rating, authorName, reviewText]
    );
    return NextResponse.json({ ok: true, id: result.insertId, message: 'Submitted - awaiting approval.' });
  } catch (err) {
    console.error('[reviews] POST failed', err);
    return NextResponse.json({ error: 'Failed to submit review' }, { status: 500 });
  }
}

// app/api/reviews/import/route.js
//
// Manual/CSV review import - admin-token gated. No scraping, no third-party
// service: an admin has already collected the review text themselves (e.g.
// copy-pasted from another store's listing) and is entering it here, either
// one at a time or as a batch pasted/uploaded from a spreadsheet. Every row
// lands as 'pending', source='imported' - same moderation queue a customer
// submission goes through (see reviews-schema.sql) - and is always labeled
// "Manufacturer review" wherever it's eventually displayed, never as a
// ShopQ customer's.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';

export async function POST(request) {
  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const productId = String(body.productId || '').trim();
  const rows = Array.isArray(body.reviews) ? body.reviews : [];

  if (!productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 });
  if (!rows.length) return NextResponse.json({ error: 'At least one review is required' }, { status: 400 });

  const cleaned = [];
  for (const [index, row] of rows.entries()) {
    const rating = Math.round(Number(row.rating));
    const reviewText = String(row.reviewText || '').trim().slice(0, 5000);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: `Row ${index + 1}: rating must be a number from 1 to 5` }, { status: 400 });
    }
    if (!reviewText) {
      return NextResponse.json({ error: `Row ${index + 1}: reviewText is required` }, { status: 400 });
    }
    cleaned.push({
      rating,
      authorName: String(row.authorName || '').trim().slice(0, 120) || 'Anonymous',
      reviewText,
      sourceUrl: row.sourceUrl ? String(row.sourceUrl).trim().slice(0, 500) : null,
      sourceCountry: row.sourceCountry ? String(row.sourceCountry).trim().slice(0, 80) : null,
    });
  }

  try {
    const pool = getDbPool();
    await Promise.all(
      cleaned.map((r) =>
        pool.query(
          `INSERT INTO reviews (product_id, source, status, rating, author_name, review_text, source_url, source_country)
           VALUES (?, 'imported', 'pending', ?, ?, ?, ?, ?)`,
          [productId, r.rating, r.authorName, r.reviewText, r.sourceUrl, r.sourceCountry]
        )
      )
    );
    return NextResponse.json({ ok: true, imported: cleaned.length, message: `Imported ${cleaned.length} review(s), pending approval.` });
  } catch (err) {
    console.error('[reviews/import] DB insert failed', err);
    return NextResponse.json({ error: 'Failed to save reviews' }, { status: 500 });
  }
}

// app/api/site-offer/route.js
//
// The single site-wide "20% off / SHOPQ20" first-order offer. Was three
// separate hardcoded copies (OfferHero.jsx, exitModal/index.jsx, and
// NewsLetter.jsx importing OfferHero's) that a code comment warned had to be
// kept in sync by hand. GET is public (called on every page, since the exit
// modal and top bar can trigger anywhere); PUT is the only write path,
// admin-token gated, and always writes the same row (id = 1).
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const DEFAULTS = { discountLabel: '20%', code: 'SHOPQ20' };

export async function GET() {
  try {
    const pool = getDbPool();
    const [rows] = await pool.query('SELECT discount_label, code FROM site_offer WHERE id = 1');
    if (!rows.length) return NextResponse.json(DEFAULTS);
    return NextResponse.json({ discountLabel: rows[0].discount_label, code: rows[0].code });
  } catch (err) {
    console.error('[site-offer] GET failed', err);
    return NextResponse.json(DEFAULTS);
  }
}

export async function PUT(request) {
  const auth = checkAdminToken(request, 'ADMIN_CONTENT_TOKEN');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const discountLabel = String(body.discountLabel || '').trim().slice(0, 20);
  const code = String(body.code || '').trim().slice(0, 30);
  if (!discountLabel || !code) {
    return NextResponse.json({ error: 'discountLabel and code are required' }, { status: 400 });
  }

  try {
    const pool = getDbPool();
    await pool.query(
      `INSERT INTO site_offer (id, discount_label, code) VALUES (1, ?, ?)
       ON DUPLICATE KEY UPDATE discount_label = VALUES(discount_label), code = VALUES(code)`,
      [discountLabel, code]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[site-offer] PUT failed', err);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}

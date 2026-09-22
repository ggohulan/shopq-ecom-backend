// app/api/promo-banners/route.js
//
// Backs the homepage promo banner cards (src/components/parisTheme/PromoBanners.jsx),
// which used to be two hardcoded JSX cards. GET is public (read-only, called
// on every homepage view) and returns only active banners by default;
// ?all=1 plus a valid admin token also returns inactive ones, for the admin
// list. POST (create) is admin-token gated. Forced dynamic so this never
// gets caught in Next's route cache - a live DB read every time, no staleness.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function serialize(row) {
  return {
    id: row.id,
    theme: row.theme,
    badge: row.badge,
    headline: row.headline,
    sub: row.sub,
    ctaText: row.cta_text,
    linkType: row.link_type,
    linkValue: row.link_value,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    isActive: !!row.is_active,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wantsAll = searchParams.get('all') === '1';
  const auth = wantsAll ? checkAdminToken(request, 'ADMIN_CONTENT_TOKEN') : { ok: false };

  try {
    const pool = getDbPool();
    const [rows] = await pool.query(
      wantsAll && auth.ok
        ? 'SELECT * FROM promo_banners ORDER BY sort_order ASC, id ASC'
        : 'SELECT * FROM promo_banners WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
    );
    return NextResponse.json({ banners: rows.map(serialize) });
  } catch (err) {
    console.error('[promo-banners] GET failed', err);
    return NextResponse.json({ banners: [] });
  }
}

export async function POST(request) {
  const auth = checkAdminToken(request, 'ADMIN_CONTENT_TOKEN');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const theme = body.theme === 'brown' ? 'brown' : 'blue';
  const badge = String(body.badge || '').slice(0, 60);
  const headline = String(body.headline || '').slice(0, 150);
  const sub = String(body.sub || '').slice(0, 255);
  const ctaText = String(body.ctaText || 'Shop now').slice(0, 60);
  const linkType = body.linkType === 'url' ? 'url' : 'product';
  const linkValue = String(body.linkValue || '').slice(0, 255);
  const imageUrl = String(body.imageUrl || '').slice(0, 500);
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;
  const isActive = body.isActive === false ? 0 : 1;

  if (!headline.trim() || !imageUrl.trim()) {
    return NextResponse.json({ error: 'headline and imageUrl are required' }, { status: 400 });
  }

  try {
    const pool = getDbPool();
    const [result] = await pool.query(
      `INSERT INTO promo_banners (theme, badge, headline, sub, cta_text, link_type, link_value, image_url, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [theme, badge, headline, sub, ctaText, linkType, linkValue, imageUrl, sortOrder, isActive]
    );
    return NextResponse.json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('[promo-banners] POST failed', err);
    return NextResponse.json({ error: 'Failed to create banner' }, { status: 500 });
  }
}

// app/api/sidebar-promos/route.js
//
// Backs the two sidebar promo cards on the homepage (src/components/parisTheme/
// SidebarPromo.jsx), previously hardcoded. Same public-GET / admin-token-write
// pattern as ../promo-banners/route.js - see that file for the reasoning.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

function serialize(row) {
  let checklist = [];
  try {
    checklist = JSON.parse(row.checklist_json || '[]');
  } catch (e) {
    checklist = [];
  }
  return {
    id: row.id,
    cardType: row.card_type,
    badge: row.badge,
    headlinePrefix: row.headline_prefix,
    highlight: row.highlight,
    headlineSuffix: row.headline_suffix,
    startLabel: row.start_label,
    midLabel: row.mid_label,
    endLabel: row.end_label,
    headline: row.headline,
    checklist,
    ctaText: row.cta_text,
    imageUrl: row.image_url,
    productId: row.product_id,
    sortOrder: row.sort_order,
    isActive: !!row.is_active,
  };
}

function parseBody(body) {
  const cardType = body.cardType === 'goal_tracker' ? 'goal_tracker' : 'checklist';
  const checklist = Array.isArray(body.checklist) ? body.checklist.filter(Boolean).slice(0, 6).map((s) => String(s).slice(0, 40)) : [];
  return {
    cardType,
    badge: String(body.badge || '').slice(0, 60),
    headlinePrefix: String(body.headlinePrefix || '').slice(0, 60),
    highlight: String(body.highlight || '').slice(0, 60),
    headlineSuffix: String(body.headlineSuffix || '').slice(0, 60),
    startLabel: String(body.startLabel || '').slice(0, 30),
    midLabel: String(body.midLabel || '').slice(0, 60),
    endLabel: String(body.endLabel || '').slice(0, 30),
    headline: String(body.headline || '').slice(0, 150),
    checklistJson: JSON.stringify(checklist),
    ctaText: String(body.ctaText || 'Add to cart').slice(0, 60),
    imageUrl: String(body.imageUrl || '').slice(0, 500),
    productId: String(body.productId || '').slice(0, 64),
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
    isActive: body.isActive === false ? 0 : 1,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wantsAll = searchParams.get('all') === '1';
  const auth = wantsAll ? checkAdminToken(request) : { ok: false };

  try {
    const pool = getDbPool();
    const [rows] = await pool.query(
      wantsAll && auth.ok
        ? 'SELECT * FROM sidebar_promos ORDER BY sort_order ASC, id ASC'
        : 'SELECT * FROM sidebar_promos WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
    );
    return NextResponse.json({ cards: rows.map(serialize) });
  } catch (err) {
    console.error('[sidebar-promos] GET failed', err);
    return NextResponse.json({ cards: [] });
  }
}

export async function POST(request) {
  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const v = parseBody(body);
  if (!v.imageUrl.trim() || !v.productId.trim()) {
    return NextResponse.json({ error: 'imageUrl and productId are required' }, { status: 400 });
  }
  if (v.cardType === 'goal_tracker' && !v.highlight.trim()) {
    return NextResponse.json({ error: 'highlight is required for a goal tracker card' }, { status: 400 });
  }
  if (v.cardType === 'checklist' && !v.headline.trim()) {
    return NextResponse.json({ error: 'headline is required for a checklist card' }, { status: 400 });
  }

  try {
    const pool = getDbPool();
    const [result] = await pool.query(
      `INSERT INTO sidebar_promos (card_type, badge, headline_prefix, highlight, headline_suffix, start_label, mid_label, end_label, headline, checklist_json, cta_text, image_url, product_id, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [v.cardType, v.badge, v.headlinePrefix, v.highlight, v.headlineSuffix, v.startLabel, v.midLabel, v.endLabel, v.headline, v.checklistJson, v.ctaText, v.imageUrl, v.productId, v.sortOrder, v.isActive]
    );
    return NextResponse.json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('[sidebar-promos] POST failed', err);
    return NextResponse.json({ error: 'Failed to create card' }, { status: 500 });
  }
}

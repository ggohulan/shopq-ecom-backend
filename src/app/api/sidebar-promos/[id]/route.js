// app/api/sidebar-promos/[id]/route.js
//
// Update/delete a single sidebar promo card. Both admin-token gated - see
// ../route.js for the public list + create.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

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

export async function PUT(request, { params }) {
  const auth = checkAdminToken(request, 'ADMIN_CONTENT_TOKEN');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

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
      `UPDATE sidebar_promos SET card_type=?, badge=?, headline_prefix=?, highlight=?, headline_suffix=?, start_label=?, mid_label=?, end_label=?, headline=?, checklist_json=?, cta_text=?, image_url=?, product_id=?, sort_order=?, is_active=?
       WHERE id=?`,
      [v.cardType, v.badge, v.headlinePrefix, v.highlight, v.headlineSuffix, v.startLabel, v.midLabel, v.endLabel, v.headline, v.checklistJson, v.ctaText, v.imageUrl, v.productId, v.sortOrder, v.isActive, id]
    );
    if (result.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[sidebar-promos] PUT failed', err);
    return NextResponse.json({ error: 'Failed to update card' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = checkAdminToken(request, 'ADMIN_CONTENT_TOKEN');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  try {
    const pool = getDbPool();
    const [result] = await pool.query('DELETE FROM sidebar_promos WHERE id = ?', [id]);
    if (result.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[sidebar-promos] DELETE failed', err);
    return NextResponse.json({ error: 'Failed to delete card' }, { status: 500 });
  }
}

// app/api/promo-banners/[id]/route.js
//
// Update/delete a single promo banner. Both admin-token gated - see
// ../route.js for the public list + create.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

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
      `UPDATE promo_banners SET theme=?, badge=?, headline=?, sub=?, cta_text=?, link_type=?, link_value=?, image_url=?, sort_order=?, is_active=?
       WHERE id=?`,
      [theme, badge, headline, sub, ctaText, linkType, linkValue, imageUrl, sortOrder, isActive, id]
    );
    if (result.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[promo-banners] PUT failed', err);
    return NextResponse.json({ error: 'Failed to update banner' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = checkAdminToken(request, 'ADMIN_CONTENT_TOKEN');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  try {
    const pool = getDbPool();
    const [result] = await pool.query('DELETE FROM promo_banners WHERE id = ?', [id]);
    if (result.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[promo-banners] DELETE failed', err);
    return NextResponse.json({ error: 'Failed to delete banner' }, { status: 500 });
  }
}

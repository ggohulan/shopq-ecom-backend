// app/api/reviews/[id]/route.js
//
// Moderation actions on a single review - admin-token gated. PATCH can set
// status (approve/reject back to pending, etc.) and/or touch up the rating/
// text/author (useful for cleaning up an imported review's formatting
// without having to delete and re-import it). DELETE removes it outright.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';

export async function PATCH(request, { params }) {
  const { id } = await params;
  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sets = [];
  const values = [];

  if (body.status !== undefined) {
    if (!['pending', 'approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'status must be pending, approved, or rejected' }, { status: 400 });
    }
    sets.push('status = ?', 'moderated_at = NOW()');
    values.push(body.status);
  }
  if (body.rating !== undefined) {
    const rating = Math.round(Number(body.rating));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'rating must be a number from 1 to 5' }, { status: 400 });
    }
    sets.push('rating = ?');
    values.push(rating);
  }
  if (body.authorName !== undefined) {
    sets.push('author_name = ?');
    values.push(String(body.authorName).trim().slice(0, 120) || 'Anonymous');
  }
  if (body.reviewText !== undefined) {
    sets.push('review_text = ?');
    values.push(String(body.reviewText).trim().slice(0, 5000));
  }

  if (!sets.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  try {
    const pool = getDbPool();
    await pool.query(`UPDATE reviews SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reviews] PATCH failed', err);
    return NextResponse.json({ error: 'Failed to update review' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const pool = getDbPool();
    await pool.query('DELETE FROM reviews WHERE id = ?', [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[reviews] DELETE failed', err);
    return NextResponse.json({ error: 'Failed to delete review' }, { status: 500 });
  }
}

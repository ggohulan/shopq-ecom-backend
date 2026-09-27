// app/api/product-images/[id]/route.js
//
// PATCH sets which image is primary (thumbnail/listing image) or updates its
// sort_order; DELETE removes an image (DB row + the file on disk). Both are
// admin-token gated - there's no public read here, that's the collection
// route (GET /api/product-images?productId=...).
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';
import { deleteProductImage } from '@/lib/uploads';

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

  try {
    const pool = getDbPool();
    const [rows] = await pool.query('SELECT product_id FROM product_images WHERE id = ?', [id]);
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { product_id: productId } = rows[0];

    if (body.isPrimary === true) {
      // Only one primary image per product - a transaction keeps the
      // "clear the rest, set this one" swap atomic instead of racing two
      // separate UPDATEs.
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('UPDATE product_images SET is_primary = 0 WHERE product_id = ?', [productId]);
        await conn.query('UPDATE product_images SET is_primary = 1 WHERE id = ?', [id]);
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }

    if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) {
      await pool.query('UPDATE product_images SET sort_order = ? WHERE id = ?', [Number(body.sortOrder), id]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[product-images] PATCH failed', err);
    return NextResponse.json({ error: 'Failed to update image' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const pool = getDbPool();
    const [rows] = await pool.query('SELECT file_path, product_id, is_primary FROM product_images WHERE id = ?', [id]);
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { file_path: filePath, product_id: productId, is_primary: wasPrimary } = rows[0];

    await pool.query('DELETE FROM product_images WHERE id = ?', [id]);
    await deleteProductImage(filePath);

    if (wasPrimary) {
      // Promote the next image (lowest sort_order) to primary so a product
      // is never left with images but no primary one.
      await pool.query('UPDATE product_images SET is_primary = 1 WHERE product_id = ? ORDER BY sort_order ASC LIMIT 1', [productId]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[product-images] DELETE failed', err);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}

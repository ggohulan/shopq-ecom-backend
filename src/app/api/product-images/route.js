// app/api/product-images/route.js
//
// Product photo hosting - this backend is becoming the source of truth for
// every product image, replacing the CRM as the image source (see
// HANDOVER.md's "full replacement" discussion). Files are stored on disk
// (src/lib/uploads.js) and served back through GET /api/uploads/[...path];
// only the relative path is stored in the DB so moving storage location or
// domain never needs a data migration.
//
// This route is backend-only for now - nothing on the storefront reads from
// it yet. The storefront switch-over is a separate, deliberate step.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';
import { isAllowedImageType, maxUploadBytes, saveProductImage } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

function serialize(row) {
  return {
    id: row.id,
    productId: row.product_id,
    url: `/api/uploads/${row.file_path}`,
    isPrimary: !!row.is_primary,
    sortOrder: row.sort_order,
  };
}

// GET is public and unauthenticated on purpose, matching product-content's
// GET - read-only, non-sensitive, and meant to eventually be called on every
// product page view once the storefront switches over.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');
  if (!productId) {
    return NextResponse.json({ error: 'productId is required' }, { status: 400 });
  }

  try {
    const pool = getDbPool();
    const [rows] = await pool.query(
      'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC, id ASC',
      [productId]
    );
    return NextResponse.json({ images: rows.map(serialize) });
  } catch (err) {
    console.error('[product-images] GET failed', err);
    return NextResponse.json({ images: [] });
  }
}

// A file named with "main" as a keyword - "main.jpg", "product-MAIN-shot.png",
// "IMG_main_1.webp", etc. - is treated as an explicit signal that this is the
// primary/thumbnail image, so bulk-uploading a folder of product photos
// doesn't require a separate manual "set primary" click afterward.
function looksLikeMainImage(filename) {
  return /main/i.test(filename || '');
}

// POST is a multipart upload (productId + file), admin-token gated. An
// uploaded file becomes primary if its filename matches looksLikeMainImage
// above, or if it's the first image ever uploaded for that product (so a
// product is never left with images but no primary one).
export async function POST(request) {
  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const productId = String(form.get('productId') || '').trim();
  const file = form.get('file');

  if (!productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 });
  if (!(file instanceof Blob) || !file.size) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (file.size > maxUploadBytes()) {
    return NextResponse.json({ error: `File too large - max ${Math.floor(maxUploadBytes() / (1024 * 1024))}MB` }, { status: 400 });
  }
  if (!isAllowedImageType(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type - use JPG, PNG, WEBP, or GIF' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const relativePath = await saveProductImage(buffer, file.type);

    const pool = getDbPool();
    const [[stats]] = await pool.query('SELECT COUNT(*) AS cnt, MAX(sort_order) AS maxOrder FROM product_images WHERE product_id = ?', [
      productId,
    ]);
    const hasNone = Number(stats.cnt) === 0;
    const makePrimary = looksLikeMainImage(typeof file.name === 'string' ? file.name : '') || hasNone;
    const nextOrder = (stats.maxOrder === null ? -1 : Number(stats.maxOrder)) + 1;

    let insertedId;
    if (makePrimary) {
      // Only one primary image per product - clearing the rest and setting
      // this one happens in a transaction so a "main"-named file uploaded
      // after other images doesn't leave two rows marked primary.
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('UPDATE product_images SET is_primary = 0 WHERE product_id = ?', [productId]);
        const [result] = await conn.query('INSERT INTO product_images (product_id, file_path, is_primary, sort_order) VALUES (?, ?, 1, ?)', [
          productId,
          relativePath,
          nextOrder,
        ]);
        insertedId = result.insertId;
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    } else {
      const [result] = await pool.query('INSERT INTO product_images (product_id, file_path, is_primary, sort_order) VALUES (?, ?, 0, ?)', [
        productId,
        relativePath,
        nextOrder,
      ]);
      insertedId = result.insertId;
    }

    return NextResponse.json({
      ok: true,
      image: serialize({
        id: insertedId,
        product_id: productId,
        file_path: relativePath,
        is_primary: makePrimary ? 1 : 0,
        sort_order: nextOrder,
      }),
    });
  } catch (err) {
    console.error('[product-images] POST failed', err);
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}

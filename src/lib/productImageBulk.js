// src/lib/productImageBulk.js
//
// Server-side helpers for the bulk product image upload
// (/admin/bulk-product-images): the product catalog the AI chooses from,
// product details for the review screen, and a safe way to save a product's
// images (files + product_images rows) in one go.
import { getDbPool } from '@/lib/db';
import { saveProductImage, deleteProductImage, maxUploadBytes } from '@/lib/uploads';

export const MAX_FILES_PER_PRODUCT = 12;

/** The catalog the AI may choose from: every active product in product_index. */
export async function loadCatalog(pool = getDbPool()) {
  const [rows] = await pool.query('SELECT product_id, name FROM product_index WHERE status = "active" ORDER BY CAST(product_id AS UNSIGNED), product_id');
  return rows.map((r) => {
    const name = String(r.name || '').trim();
    return { id: String(r.product_id), name, names: [name], code: '' };
  });
}

export function serializeImage(row) {
  return { id: row.id, productId: row.product_id, url: `/api/uploads/${row.file_path}`, isPrimary: !!row.is_primary, sortOrder: row.sort_order };
}

/** Name, thumbnail and current images of the given products, for the review screen. */
export async function productDetails(ids, pool = getDbPool()) {
  const unique = [...new Set(ids.map(String))];
  const out = {};
  if (!unique.length) return out;
  const marks = unique.map(() => '?').join(',');
  const [products] = await pool.query(`SELECT product_id, name, thumbnail_url FROM product_index WHERE product_id IN (${marks})`, unique);
  const [images] = await pool.query(`SELECT * FROM product_images WHERE product_id IN (${marks}) ORDER BY is_primary DESC, sort_order ASC, id ASC`, unique);
  for (const p of products) out[String(p.product_id)] = { id: String(p.product_id), name: p.name, thumbnail: p.thumbnail_url || null, existing: [] };
  for (const img of images) {
    const entry = out[String(img.product_id)];
    if (entry) entry.existing.push(serializeImage(img));
  }
  return out;
}

// Real file type from the first bytes, not the name or the type the browser
// claims, so a renamed file cannot be stored as an image.
export function sniffImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('latin1'))) return 'image/gif';
  return null;
}

export class BulkImageError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

/**
 * Saves a product's images. `files` are Blobs in order: the first is the main image.
 *
 * mode:
 *   'add'               keep the current images; the new main image becomes the product's primary image
 *   'add_keep_primary'  keep the current images and their primary one (the new main becomes primary only if there was none)
 *   'replace'           remove the current images once the new ones are saved
 *
 * All files are written first; if anything fails nothing is changed and the new files are removed again.
 * Old files of a replaced set are deleted only after the database change is committed.
 */
export async function saveProductImages(productId, files, mode, pool = getDbPool()) {
  if (!['add', 'add_keep_primary', 'replace'].includes(mode)) throw new BulkImageError('Unknown save mode.');
  if (!files.length) throw new BulkImageError('No images to save.');
  if (files.length > MAX_FILES_PER_PRODUCT) throw new BulkImageError(`At most ${MAX_FILES_PER_PRODUCT} images can be saved for one product at a time.`);

  const [[known]] = await pool.query('SELECT COUNT(*) AS n FROM product_index WHERE product_id = ? AND status = "active"', [productId]);
  if (!Number(known.n)) throw new BulkImageError('This product is not in the product list. Run the product sync on the Products page and try again.', 404);

  // read and check every file before writing anything
  const prepared = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const label = `Image ${i + 1}${f && f.name ? ` (${f.name})` : ''}`;
    if (!(f instanceof Blob) || !f.size) throw new BulkImageError(`${label}: the file is empty.`);
    if (f.size > maxUploadBytes()) throw new BulkImageError(`${label}: the file is larger than ${Math.floor(maxUploadBytes() / (1024 * 1024))} MB.`);
    const buffer = Buffer.from(await f.arrayBuffer());
    const type = sniffImageType(buffer);
    if (!type) throw new BulkImageError(`${label}: this is not a valid JPG, PNG, WEBP or GIF image.`);
    prepared.push({ buffer, type });
  }

  const written = [];
  let conn;
  let lockName = null;
  try {
    for (const p of prepared) written.push(await saveProductImage(p.buffer, p.type));

    conn = await pool.getConnection();
    lockName = `product_images_${productId}`;
    const [[lock]] = await conn.query('SELECT GET_LOCK(?, 10) AS got', [lockName]);
    if (!Number(lock.got)) {
      lockName = null;
      throw new BulkImageError('Another upload for this product is running. Try again in a moment.', 409);
    }

    await conn.beginTransaction();
    const [old] = await conn.query('SELECT id, file_path, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC, id ASC FOR UPDATE', [productId]);

    const hadPrimary = old.some((r) => r.is_primary);
    const makeMainPrimary = mode === 'add_keep_primary' ? !hadPrimary : true;
    let order = mode === 'replace' ? 0 : old.reduce((m, r) => Math.max(m, Number(r.sort_order)), -1) + 1;

    if (mode === 'add' && makeMainPrimary) await conn.query('UPDATE product_images SET is_primary = 0 WHERE product_id = ?', [productId]);

    for (let i = 0; i < written.length; i++) {
      await conn.query('INSERT INTO product_images (product_id, file_path, is_primary, sort_order) VALUES (?, ?, ?, ?)', [
        productId,
        written[i],
        i === 0 && makeMainPrimary ? 1 : 0,
        order++,
      ]);
    }

    let removed = [];
    if (mode === 'replace') {
      removed = old;
      if (old.length) await conn.query(`DELETE FROM product_images WHERE id IN (${old.map(() => '?').join(',')})`, old.map((r) => r.id));
    }
    await conn.commit();

    for (const r of removed) await deleteProductImage(r.file_path);

    const [rows] = await pool.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC, id ASC', [productId]);
    return { saved: written.length, removed: removed.length, images: rows.map(serializeImage) };
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    for (const w of written) await deleteProductImage(w);
    throw err;
  } finally {
    if (conn) {
      if (lockName) await conn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
      conn.release();
    }
  }
}

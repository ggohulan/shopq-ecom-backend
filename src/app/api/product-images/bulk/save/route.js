// app/api/product-images/bulk/save/route.js
//
// Bulk product image upload, step 2: save the reviewed images of ONE product.
// Multipart: productId, mode ('add' | 'add_keep_primary' | 'replace') and
// several "files" entries in order - the FIRST file is the product's main
// image. Files and rows are saved together or not at all; see
// saveProductImages in src/lib/productImageBulk.js. The single-file route
// (POST /api/product-images) is unchanged.
import { NextResponse } from 'next/server';
import { checkAdminToken } from '@/lib/adminAuth';
import { BulkImageError, saveProductImages } from '@/lib/productImageBulk';

export const dynamic = 'force-dynamic';

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
  const mode = String(form.get('mode') || 'add');
  const files = form.getAll('files').filter((f) => f instanceof Blob);
  if (!productId) return NextResponse.json({ ok: false, error: 'productId is required' }, { status: 400 });

  try {
    const result = await saveProductImages(productId, files, mode);
    const n = result.saved;
    return NextResponse.json({
      ok: true,
      message: `${n} image${n === 1 ? '' : 's'} saved${result.removed ? `, ${result.removed} old removed` : ''}.`,
      saved: result.saved,
      removed: result.removed,
      images: result.images,
    });
  } catch (err) {
    if (err instanceof BulkImageError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    console.error('[product-images/bulk/save] failed', err);
    return NextResponse.json({ ok: false, error: 'The images could not be saved. Nothing was changed.' }, { status: 500 });
  }
}

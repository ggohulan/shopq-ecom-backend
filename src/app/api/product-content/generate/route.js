// app/api/product-content/generate/route.js
//
// Drafts product_content (Features/Highlights/Key Features/Ideal For/Why
// You'll Love It/Specifications) with Claude, from the product's live CRM
// name/description/category - see src/lib/productContentAi.js. Returns a
// draft for the admin UI to fill the existing form with; nothing is saved
// here. Admin-token gated since it costs a real API call per request.
import { NextResponse } from 'next/server';
import { checkAdminToken } from '@/lib/adminAuth';
import { draftProductContent } from '@/lib/productContentAi';

const RAW_BASE = (process.env.LARAVEL_API_BASE_URL || '').replace(/\/$/, '');

export async function POST(request) {
  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const productId = String(body.productId || '').trim();
  if (!productId) return NextResponse.json({ error: 'productId is required' }, { status: 400 });
  if (!RAW_BASE) return NextResponse.json({ error: 'Server misconfiguration: LARAVEL_API_BASE_URL not set' }, { status: 500 });

  let product;
  try {
    const res = await fetch(`${RAW_BASE}/products/${productId}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return NextResponse.json({ error: 'Could not find this product in the CRM' }, { status: 404 });
    const json = await res.json();
    product = json?.data ?? json;
  } catch (err) {
    console.error('[product-content/generate] CRM lookup failed', err);
    return NextResponse.json({ error: 'Could not reach the CRM' }, { status: 502 });
  }

  if (!product?.name) {
    return NextResponse.json({ error: 'Could not find this product in the CRM' }, { status: 404 });
  }

  try {
    const draft = await draftProductContent({
      name: product.name,
      description: product.description,
      category: product.category,
      subcategory: product.subcategory,
      price: product.selling_price ?? product.effective_price,
    });
    return NextResponse.json({ ok: true, draft });
  } catch (err) {
    console.error('[product-content/generate] generation failed', err);
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 502 });
  }
}

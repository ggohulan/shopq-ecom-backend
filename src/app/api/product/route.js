// app/api/product/route.js
//
// A lean CRM product lookup, used only by the admin pages that need to
// cross-reference a product_id against a real name/price/thumbnail
// (product-content's search+picker, and the funnel/cart-abandonment
// reports' "which product is #139" lookup). Calls the CRM live on every
// request rather than caching a copy - per the hosting brief's own rule,
// this backend never stores product price/stock, since that would risk
// showing a stale value the storefront's own CRM-backed pages don't.
import { NextResponse } from 'next/server';

const RAW_BASE = (process.env.LARAVEL_API_BASE_URL || '').replace(/\/$/, '');

function normalizeImageUrl(base, url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  let fixed = url.replace(/^\/?api\/v1\/storage/i, '/uploads').replace(/^\/?storage/i, '/uploads');
  try {
    if (!base) return fixed;
    const origin = new URL(base).origin;
    return fixed.startsWith('/') ? origin + fixed : origin + '/' + fixed;
  } catch (e) {
    return fixed;
  }
}

export async function GET(request) {
  if (!RAW_BASE) {
    return NextResponse.json({ error: 'Server misconfiguration: LARAVEL_API_BASE_URL not set' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const query = new URLSearchParams({
    page: searchParams.get('page') || '1',
    per_page: searchParams.get('per_page') || '40',
    status: searchParams.get('status') || '1',
    search: searchParams.get('search') || '',
    ids: searchParams.get('ids') || '',
  });

  try {
    const res = await fetch(`${RAW_BASE}/products?${query.toString()}`, { signal: AbortSignal.timeout(10000) });
    const laravelData = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: 'CRM request failed' }, { status: res.status });
    }

    const items = Array.isArray(laravelData.data) ? laravelData.data : Array.isArray(laravelData) ? laravelData : [];
    const data = items.map((product) => ({
      id: product.id,
      name: product.name ?? product.product_name,
      slug: product.slug ?? String(product.id),
      price: product.price,
      selling_price: product.sale_price,
      product_thumbnail: { original_url: normalizeImageUrl(RAW_BASE, product?.product_thumbnail?.original_url) || null },
      stock_status: product.stock_status || (Number(product.quantity || 0) > 0 ? 'in_stock' : 'out_of_stock'),
    }));

    return NextResponse.json({
      data,
      current_page: laravelData.current_page ?? 1,
      total: laravelData.total ?? data.length,
      per_page: laravelData.per_page ?? data.length,
    });
  } catch (err) {
    console.error('[product lookup] failed', err);
    return NextResponse.json({ error: 'Could not reach the CRM' }, { status: 502 });
  }
}

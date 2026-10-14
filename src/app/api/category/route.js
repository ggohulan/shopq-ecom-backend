// app/api/category/route.js
//
// A lean CRM category lookup for the /admin/seo page's category list - same
// pattern as /api/product/route.js (calls the CRM live, no caching here;
// this backend never stores category names). Unlike product_index, there's
// no known bug in the CRM's category list endpoint, so this hits it
// directly rather than going through a local index.
import { NextResponse } from 'next/server';

const RAW_BASE = (process.env.LARAVEL_API_BASE_URL || '').replace(/\/$/, '');

export async function GET() {
  if (!RAW_BASE) {
    return NextResponse.json({ error: 'Server misconfiguration: LARAVEL_API_BASE_URL not set' }, { status: 500 });
  }

  try {
    const res = await fetch(`${RAW_BASE}/categories`, { signal: AbortSignal.timeout(10000) });
    const laravelData = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: 'CRM request failed' }, { status: res.status });
    }

    const items = Array.isArray(laravelData?.data) ? laravelData.data : Array.isArray(laravelData) ? laravelData : [];
    const data = items.map((cat) => ({
      id: String(cat.slug ?? cat.id),
      name: cat.name,
      subcategories: Array.isArray(cat.subcategories)
        ? cat.subcategories.map((sub) => ({ id: String(sub.id), name: sub.name }))
        : [],
    }));

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[category lookup] failed', err);
    return NextResponse.json({ error: 'Could not reach the CRM' }, { status: 502 });
  }
}

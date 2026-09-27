// app/api/product-index/sync/route.js
//
// Manual control for the background product_index sync (see
// src/instrumentation.js and src/lib/productIndexSync.js), admin-token
// gated since a full run makes ~1000 requests to the CRM over ~15 minutes -
// not something to expose to anyone but a signed-in admin. GET reports
// status (useful for a "Last synced" line in the UI); POST kicks off a run
// immediately instead of waiting for the next scheduled one.
import { NextResponse } from 'next/server';
import { checkAdminToken } from '@/lib/adminAuth';
import { getSyncStatus, runProductIndexSync } from '@/lib/productIndexSync';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json(getSyncStatus());
}

export async function POST(request) {
  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (getSyncStatus().running) {
    return NextResponse.json({ error: 'A sync is already running' }, { status: 409 });
  }

  // Deliberately not awaited - a full run takes ~15 minutes (1000 IDs,
  // paced to avoid the CRM's rate limit), far longer than any reasonable
  // request timeout. The caller polls GET for progress instead.
  runProductIndexSync({ from: 1, to: 1000 }).catch((err) => {
    console.error('[product-index-sync] manual run failed', err);
  });

  return NextResponse.json({ ok: true, message: 'Sync started' });
}

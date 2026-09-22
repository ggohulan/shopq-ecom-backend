// app/api/funnel-event/route.js
//
// Open POST endpoint (sendBeacon can't attach custom auth headers) - but
// unlike /api/vitals, this one writes to MySQL, so it needs real hardening,
// not just "same as vitals" (that reasoning didn't hold up on review: vitals
// only console.logs, this inserts a row on every product view). Filters
// obvious bots, deduplicates views, rate-limits, validates strictly, and
// always fails silently - this must never block or slow the page it logs.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';

const EVENT_TYPES = new Set(['view', 'add_to_cart', 'remove_from_cart', 'checkout_start', 'purchase']);
const VIEW_DEDUP_MS = 30 * 60 * 1000; // one view per visitor per product per ~30 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60; // per IP per minute - generous for a real visitor, cheap to hit for a script

// In-memory, per server instance - resets on cold start/redeploy. A real
// rate limit shared across instances (Redis, Upstash) is the next step if
// this proves not enough; this is the "basic" version the review asked for,
// not a guarantee.
const recentViews = new Map(); // `${session_id}:${product_id}` -> last logged timestamp
const rateBuckets = new Map(); // ip -> { count, windowStart }

function isLikelyBot(userAgent) {
  if (!userAgent) return true; // no UA at all - almost certainly not a browser
  return /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|curl|wget|python-requests|axios\/|headlesschrome/i.test(userAgent);
}

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(ip, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

function isDuplicateView(sessionId, productId) {
  const key = `${sessionId}:${productId}`;
  const last = recentViews.get(key);
  const now = Date.now();
  if (last && now - last < VIEW_DEDUP_MS) return true;
  recentViews.set(key, now);
  // Cheap, unbounded-growth guard - only matters under sustained real traffic,
  // and losing a few dedup entries just means one extra view gets logged.
  if (recentViews.size > 20000) recentViews.clear();
  return false;
}

export async function POST(request) {
  try {
    const userAgent = request.headers.get('user-agent');
    if (isLikelyBot(userAgent)) return NextResponse.json({ ok: true }); // pretend success, don't tip off scripts

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (isRateLimited(ip)) return NextResponse.json({ ok: true });

    let body;
    try {
      body = JSON.parse(await request.text());
    } catch (e) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const { product_id, event_type, session_id } = body || {};
    if (typeof product_id !== 'string' || !product_id.trim() || product_id.length > 64) return NextResponse.json({ ok: false }, { status: 400 });
    if (!EVENT_TYPES.has(event_type)) return NextResponse.json({ ok: false }, { status: 400 });
    if (typeof session_id !== 'string' || !session_id.trim() || session_id.length > 64) return NextResponse.json({ ok: false }, { status: 400 });

    if (event_type === 'view' && isDuplicateView(session_id, product_id)) {
      return NextResponse.json({ ok: true });
    }

    const variationId = typeof body.variation_id === 'string' ? body.variation_id.slice(0, 64) : null;
    const consumerId = typeof body.consumer_id === 'string' ? body.consumer_id.slice(0, 64) : null;
    const source = typeof body.source === 'string' ? body.source.slice(0, 32) : null;
    const quantity = Number.isFinite(Number(body.quantity)) ? Number(body.quantity) : null;
    const priceAtEvent = Number.isFinite(Number(body.price_at_event)) ? Number(body.price_at_event) : null;
    const orderId = typeof body.order_id === 'string' ? body.order_id.slice(0, 64) : null;

    const pool = getDbPool();
    await pool.query(
      `INSERT INTO product_funnel_events (product_id, variation_id, event_type, session_id, consumer_id, source, quantity, price_at_event, order_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [product_id, variationId, event_type, session_id, consumerId, source, quantity, priceAtEvent, orderId]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Fail silently by design - a logging failure must never surface to the
    // visitor or affect the action (add to cart, checkout, etc.) it's attached to.
    console.error('[funnel-event] failed', err?.message || err);
    return NextResponse.json({ ok: true });
  }
}

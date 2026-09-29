// app/api/cart-recovery/route.js
//
// Admin-token gated. GET returns the sweep's status (for a "last run" line,
// same pattern as /api/product-index/sync) plus recent send history and
// summary counts, including how many sends led to an actual purchase
// afterwards - the one number that matters more than "emails sent".
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';
import { getCartRecoveryStatus, runCartRecoverySweep, STEP_HOURS } from '@/lib/cartRecovery';
import { isEmailConfigured } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const pool = getDbPool();

    const [logRows] = await pool.query(
      `SELECT l.session_id, l.consumer_id, l.email, l.step, l.sent_at,
              EXISTS (
                SELECT 1 FROM product_funnel_events p
                WHERE p.event_type = 'purchase' AND p.created_at > l.sent_at
                  AND (p.session_id = l.session_id OR p.consumer_id = l.consumer_id)
              ) AS recovered
       FROM cart_recovery_log l
       ORDER BY l.sent_at DESC
       LIMIT 100`
    );

    const [[counts]] = await pool.query(
      `SELECT
         COUNT(*) AS totalSent,
         SUM(step = 1) AS step1Sent,
         SUM(step = 2) AS step2Sent,
         SUM(step = 3) AS step3Sent
       FROM cart_recovery_log`
    );
    const [[recoveredCount]] = await pool.query(
      `SELECT COUNT(DISTINCT l.session_id) AS recoveredSessions
       FROM cart_recovery_log l
       WHERE EXISTS (
         SELECT 1 FROM product_funnel_events p
         WHERE p.event_type = 'purchase' AND p.created_at > l.sent_at
           AND (p.session_id = l.session_id OR p.consumer_id = l.consumer_id)
       )`
    );

    return NextResponse.json({
      emailConfigured: isEmailConfigured(),
      stepHours: STEP_HOURS,
      status: getCartRecoveryStatus(),
      counts: {
        totalSent: Number(counts.totalSent) || 0,
        step1Sent: Number(counts.step1Sent) || 0,
        step2Sent: Number(counts.step2Sent) || 0,
        step3Sent: Number(counts.step3Sent) || 0,
        recoveredSessions: Number(recoveredCount.recoveredSessions) || 0,
      },
      log: logRows.map((r) => ({
        sessionId: r.session_id,
        consumerId: r.consumer_id,
        email: r.email,
        step: r.step,
        sentAt: r.sent_at,
        recovered: !!r.recovered,
      })),
    });
  } catch (err) {
    console.error('[cart-recovery] GET failed', err);
    return NextResponse.json({ error: 'Could not load cart recovery data' }, { status: 500 });
  }
}

// Manual trigger - same "not awaited, poll GET for status" pattern as
// /api/product-index/sync, though a sweep here typically finishes in
// seconds to a couple minutes (one candidates query, not ~1000 CRM calls).
export async function POST(request) {
  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (getCartRecoveryStatus().running) {
    return NextResponse.json({ error: 'A sweep is already running' }, { status: 409 });
  }

  runCartRecoverySweep().catch((err) => {
    console.error('[cart-recovery] manual sweep failed', err);
  });

  return NextResponse.json({ ok: true, message: 'Sweep started' });
}

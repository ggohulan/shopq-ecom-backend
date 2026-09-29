// src/instrumentation.js
//
// Next.js's officially-supported hook for one-time startup code in the
// server process (see https://nextjs.org/docs/app/guides/instrumentation).
// Used here to schedule the daily product_index sync (src/lib/
// productIndexSync.js) - this only actually recurs because the app runs as
// a persistent `next start` process under PM2 (see deploy/README.md), not a
// serverless function that spins down between requests.
export async function register() {
  // This project's src/middleware.js runs on the Edge runtime, which makes
  // Next call register() there too - and mysql2 (imported transitively via
  // productIndexSync -> db.js) needs Node built-ins (`crypto`, `tls`) that
  // don't exist on Edge. The dynamic import must be nested INSIDE this exact
  // `if (process.env.NEXT_RUNTIME === 'nodejs')` check (not an early-return
  // guard) - Next's bundler specifically pattern-matches this form to
  // exclude the imported module from the Edge bundle entirely.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Kill switch: PRODUCT_INDEX_SYNC_ENABLED=false in .env.local disables
    // the scheduler without a code deploy - added after the Oct 2026 incident,
    // where the sync was initially suspected (it wasn't the cause) and there
    // was no way to rule it out quickly short of editing code.
    if (process.env.PRODUCT_INDEX_SYNC_ENABLED === 'false') {
      console.log('[product-index-sync] disabled via PRODUCT_INDEX_SYNC_ENABLED=false');
      return;
    }

    // Next's dev server re-runs this on every hot-reload-triggered restart
    // of the server compartment - a globalThis flag (survives that, unlike
    // a module-level variable re-initialized per reload) stops a second
    // interval from ever stacking on top of the first.
    const g = globalThis;
    if (g.__shopqProductIndexSyncStarted) return;
    g.__shopqProductIndexSyncStarted = true;

    const { runProductIndexSync } = await import('@/lib/productIndexSync');
    const { runCartRecoverySweep } = await import('@/lib/cartRecovery');

    const DAY_MS = 24 * 60 * 60 * 1000;
    const INITIAL_DELAY_MS = 60 * 1000; // let the server finish settling first

    const run = () => {
      console.log('[product-index-sync] starting scheduled run (IDs 1-1000)');
      runProductIndexSync({ from: 1, to: 1000 }).catch((err) => {
        console.error('[product-index-sync] scheduled run failed', err);
      });
    };

    setTimeout(run, INITIAL_DELAY_MS);
    setInterval(run, DAY_MS);

    // Every 30 minutes so step 1 (fires at 1h old) reaches shoppers within
    // half an hour of becoming eligible, not once a day like the product
    // sync above - cart recovery is time-sensitive in a way the product
    // catalog mirror isn't. A no-op (skippedNotConfigured) when SMTP isn't
    // set up yet, so this is safe to leave running before that's configured.
    const HALF_HOUR_MS = 30 * 60 * 1000;
    const CART_RECOVERY_INITIAL_DELAY_MS = 90 * 1000;

    const runCartRecovery = () => {
      runCartRecoverySweep().catch((err) => {
        console.error('[cart-recovery] scheduled sweep failed', err);
      });
    };

    setTimeout(runCartRecovery, CART_RECOVERY_INITIAL_DELAY_MS);
    setInterval(runCartRecovery, HALF_HOUR_MS);
  }
}

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
    // Next's dev server re-runs this on every hot-reload-triggered restart
    // of the server compartment - a globalThis flag (survives that, unlike
    // a module-level variable re-initialized per reload) stops a second
    // interval from ever stacking on top of the first.
    const g = globalThis;
    if (g.__shopqProductIndexSyncStarted) return;
    g.__shopqProductIndexSyncStarted = true;

    const { runProductIndexSync } = await import('@/lib/productIndexSync');

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
  }
}

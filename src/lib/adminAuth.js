// src/lib/adminAuth.js
//
// Shared admin-token check for the internal /api/* write routes (product
// content, funnel report, cart abandonment, announcement editor). Each
// concern gets its OWN env var / token - see ANALYTICS_ADMIN_TOKEN vs
// ADMIN_CONTENT_TOKEN - so rotating one doesn't lock the others out, and a
// leaked content-editing token can't also pull sales data.
export function checkAdminToken(request, envVarName) {
  const expected = process.env[envVarName];
  if (!expected) {
    return { ok: false, status: 500, error: `Server misconfiguration: ${envVarName} not set` };
  }
  const token = request.headers.get('x-admin-token');
  if (!token || token !== expected) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

// src/lib/adminAuth.js
//
// Admin auth for the internal /api/* write routes (promo banners, sidebar
// cards, site offer, product content, funnel report, cart abandonment).
// Replaced the old two-shared-static-tokens setup (ADMIN_CONTENT_TOKEN /
// ANALYTICS_ADMIN_TOKEN) with a real login: one admin_users row, a password
// checked with bcrypt, and a JWT issued on success. Every write route still
// reads the same `x-admin-token` header as before - it just now holds a
// signed, expiring session token instead of a permanent shared secret.
import jwt from 'jsonwebtoken';

const JWT_EXPIRY = '7d';

export function issueAdminSession(user) {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) throw new Error('ADMIN_JWT_SECRET not set');
  return jwt.sign({ sub: user.id, username: user.username }, secret, { expiresIn: JWT_EXPIRY });
}

export function checkAdminToken(request) {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    return { ok: false, status: 500, error: 'Server misconfiguration: ADMIN_JWT_SECRET not set' };
  }
  const token = request.headers.get('x-admin-token');
  if (!token) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  try {
    const payload = jwt.verify(token, secret);
    return { ok: true, user: { id: payload.sub, username: payload.username } };
  } catch (e) {
    return { ok: false, status: 401, error: 'Session expired or invalid - please sign in again' };
  }
}

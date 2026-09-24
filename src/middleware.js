import { NextResponse } from 'next/server';

// Storefront (shopq.lk) calls this backend's /api/* cross-origin - browsers
// need explicit CORS headers on every response, plus a fast answer to the
// preflight OPTIONS request that admin writes trigger (the x-admin-token
// header isn't CORS-safelisted, so any PUT/POST/DELETE from the storefront
// is preceded by one). ALLOWED_ORIGIN defaults to production; override it
// locally to test against the storefront's dev server.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://shopq.lk';

function withCors(response) {
  response.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
  // navigator.sendBeacon (used by logFunnelEvent.js) sends the request with
  // credentials by default, which makes the browser require this header on
  // a cross-origin response - Access-Control-Allow-Origin can't be '*' when
  // it's set, but ALLOWED_ORIGIN is already a specific origin, so this is safe.
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}

export function middleware(request) {
  if (request.method === 'OPTIONS') {
    return withCors(new NextResponse(null, { status: 204 }));
  }
  return withCors(NextResponse.next());
}

export const config = {
  matcher: '/api/:path*',
};

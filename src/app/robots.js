// Keeps every route on this internal backend (not just /admin/*) out of
// crawlers - this whole project is internal tooling, never meant to be
// indexed. Needed as a top-level file rather than a `metadata` export on
// admin/layout.js, since that layout is a client component (it uses
// usePathname for nav highlighting) and client components can't export
// metadata.
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}

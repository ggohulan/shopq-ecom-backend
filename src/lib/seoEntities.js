// The storefront's static page keys - this backend has no visibility into
// that project's actual routes, so this list is a manually-kept mirror of
// the frontend's own src/app/sitemap.js STATIC_PAGES array. If a page is
// added/removed/renamed there, update this list to match, or its SEO
// override in /admin/seo will silently target a route that no longer exists
// (or a new route won't have an entry here to edit).
export const STATIC_PAGES = [
  { id: 'home', label: 'Home' },
  { id: 'collections', label: 'Collections (all categories)' },
  { id: 'offers', label: 'Offers' },
  { id: 'blogs', label: 'Blogs' },
  { id: 'about-us', label: 'About Us' },
  { id: 'contact-us', label: 'Contact Us' },
  { id: 'faq', label: 'FAQ' },
  { id: 'privacy-policy', label: 'Privacy Policy' },
];

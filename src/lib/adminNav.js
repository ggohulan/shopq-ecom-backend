// Single source of truth for the /admin/* section list - used by the
// sidebar (src/app/admin/layout.js) and the dashboard home
// (src/app/admin/page.js) so both stay in sync automatically.
export const ADMIN_SECTIONS = [
  {
    href: '/admin/product-content',
    label: 'Products',
    description: 'Images, Features, Highlights, Key Features, Ideal For, and Specifications for individual products.',
    icon: 'M4 5h16M4 12h16M4 19h10',
  },
  {
    href: '/admin/promo-banners',
    label: 'Promo Banners',
    description: 'The homepage banner row between Categories and New Arrivals.',
    icon: 'M4 6h16v9H4z M4 19h8',
  },
  {
    href: '/admin/sidebar-promos',
    label: 'Sidebar Promo Cards',
    description: 'Homepage sidebar cards shown on desktop screens 1200px and wider.',
    icon: 'M4 4h7v16H4z M13 4h7v7h-7z M13 13h7v7h-7z',
  },
  {
    href: '/admin/site-offer',
    label: 'Site-wide Offer',
    description: 'The one discount code used in the hero, exit pop-up, newsletter band, and top bar.',
    icon: 'M9 5H5v4l10 10 4-4z M8 8h.01',
  },
  {
    href: '/admin/funnel',
    label: 'Conversion Funnel',
    description: 'View → cart → checkout → purchase, by product, with likely-issue flags.',
    icon: 'M4 19V5 M4 19h16 M8 15l3-4 3 2 4-6',
  },
  {
    href: '/admin/cart-abandonment',
    label: 'Abandoned Carts',
    description: 'Items added to cart and not purchased or removed within a chosen time window.',
    icon: 'M4 4h2l2.4 12.4a2 2 0 002 1.6h7.2a2 2 0 002-1.6L20 8H6',
  },
  {
    href: '/admin/reviews',
    label: 'Reviews',
    description: 'Moderate customer-submitted reviews and manually import reviews collected elsewhere, both pending approval before going live.',
    icon: 'M12 17.3l-5.4 3 1.4-6-4.6-4 6-.5L12 4l2.6 5.8 6 .5-4.6 4 1.4 6z',
  },
  {
    href: '/admin/seo',
    label: 'SEO',
    description: 'Meta title/description, social share image, canonical URL and noindex for categories and static pages. Per-product SEO lives on the Products page.',
    icon: 'M11 4a7 7 0 104.9 12 M21 21l-4.3-4.3',
  },
];

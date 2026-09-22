const LINKS = [
  { href: '/admin/product-content', label: 'Product Content' },
  { href: '/admin/promo-banners', label: 'Promo Banners' },
  { href: '/admin/sidebar-promos', label: 'Sidebar Promo Cards' },
  { href: '/admin/site-offer', label: 'Site-wide Offer' },
  { href: '/admin/funnel', label: 'Conversion Funnel' },
  { href: '/admin/cart-abandonment', label: 'Abandoned Carts' },
];

export default function Home() {
  return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 20px', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif' }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>ShopQ Admin Backend</h1>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>Analytics, banners, product content and offers for shopq.lk.</p>
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {LINKS.map((l) => (
          <li key={l.href}>
            <a href={l.href} style={{ color: '#0da487', textDecoration: 'none', fontWeight: 600 }}>{l.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

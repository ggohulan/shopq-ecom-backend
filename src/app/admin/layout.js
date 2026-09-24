'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Internal tooling only - keep every /admin/* page out of Google (and
// every other crawler that respects robots meta). Metadata export doesn't
// work in a client component, so robots exclusion lives in
// src/app/admin/robots-meta.js instead and is re-exported per page... see
// note below - kept here as a comment since this file can no longer export
// `metadata` once it's a client component.

const NAV_LINKS = [
  { href: '/admin/site-offer', label: 'Site Offer' },
  { href: '/admin/promo-banners', label: 'Promo Banners' },
  { href: '/admin/sidebar-promos', label: 'Sidebar Promos' },
  { href: '/admin/product-content', label: 'Product Content' },
  { href: '/admin/funnel', label: 'Funnel Report' },
  { href: '/admin/cart-abandonment', label: 'Cart Abandonment' },
];

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  return (
    <>
      <nav className='adm-nav'>
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={`adm-nav-link${pathname === link.href ? ' adm-nav-link-active' : ''}`}>
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
      <style jsx global>{`
        .adm-nav { max-width: 1040px; margin: 0 auto; padding: 16px 20px 0; display: flex; gap: 4px; flex-wrap: wrap; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .adm-nav-link { font-size: 13px; font-weight: 600; color: #52525b; text-decoration: none; padding: 6px 10px; border-radius: 6px; }
        .adm-nav-link:hover { background: #f4f4f5; color: #1a1a1a; }
        .adm-nav-link-active { background: #dc2626; color: #fff; }
        .adm-nav-link-active:hover { background: #dc2626; color: #fff; }
      `}</style>
    </>
  );
}

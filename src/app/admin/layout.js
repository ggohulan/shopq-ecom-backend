'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ADMIN_SECTIONS } from '@/lib/adminNav';
import { useAdminSession } from '@/lib/adminSession';

// Internal tooling only - keep every /admin/* page out of Google (and every
// other crawler that respects robots meta). The root layout's `metadata`
// export already sets robots: noindex,nofollow site-wide, so this file
// doesn't need (and, being a client component for usePathname, couldn't
// export) its own copy.

function NavLinks({ pathname, onNavigate }) {
  return (
    <>
      <Link
        href="/admin"
        onClick={onNavigate}
        className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
          pathname === '/admin' ? 'bg-brand-50 text-brand-700' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
        }`}
      >
        Dashboard
      </Link>
      <div className="my-2 border-t border-zinc-100" />
      {ADMIN_SECTIONS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? 'bg-brand-50 text-brand-700' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 opacity-70">
              <path d={link.icon} />
            </svg>
            <span className="truncate">{link.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export default function AdminLayout({ children }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Every /admin/* page gates its own content behind AdminShell's login
  // form, but this layout wraps them all - without checking the session
  // here too, the sidebar/nav chrome would render even for a signed-out
  // visitor, before AdminShell has had a chance to hide anything. Reading
  // the same shared session (src/lib/adminSession.js) keeps the two in sync.
  const { token, ready } = useAdminSession();

  if (!ready) return null;

  if (!token) {
    return <main className="min-h-screen bg-gray-50 px-5 py-8 md:px-10">{children}</main>;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-200 bg-white px-4 py-6 md:flex">
        <Link href="/admin" className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">SQ</span>
          <span className="text-sm font-bold tracking-tight text-zinc-900">ShopQ Admin</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          <NavLinks pathname={pathname} />
        </nav>
        <p className="px-3 text-xs text-zinc-400">Internal tool — not part of shopq.lk</p>
      </aside>

      {/* Compact top bar + collapsible menu on small screens, since the sidebar hides below md */}
      <div className="fixed inset-x-0 top-0 z-10 border-b border-zinc-200 bg-white md:hidden">
        <nav className="flex items-center gap-2 px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-xs font-bold text-white">SQ</span>
          <span className="text-sm font-bold text-zinc-900">ShopQ Admin</span>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="ml-auto rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100"
            aria-label="Toggle navigation"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-5 w-5">
              {mobileOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </nav>
        {mobileOpen ? (
          <nav className="flex flex-col gap-1 border-t border-zinc-100 px-3 py-3">
            <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </nav>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 pt-14 md:pt-0">
        <main className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-10">{children}</main>
      </div>
    </div>
  );
}

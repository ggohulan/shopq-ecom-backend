'use client';

import Link from 'next/link';
import AdminShell from '@/components/admin/AdminShell';
import { ADMIN_SECTIONS } from '@/lib/adminNav';

export default function AdminDashboardPage() {
  return (
    <AdminShell title="Dashboard" subtitle="Analytics, banners, product content and offers for shopq.lk.">
      {() => (
        <div className="grid gap-4 sm:grid-cols-2">
          {ADMIN_SECTIONS.map((section) => (
            <Link key={section.href} href={section.href} className="adm-card group flex items-start gap-3.5 transition hover:border-brand-200 hover:shadow-md">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d={section.icon} />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900">{section.label}</p>
                <p className="mt-0.5 text-sm text-zinc-500">{section.description}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

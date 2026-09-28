'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import SeoMetaEditor from '@/components/admin/SeoMetaEditor';
import { STATIC_PAGES } from '@/lib/seoEntities';

// SEO overrides for categories and static pages - see HANDOVER-seo-management.md.
// Per-product SEO lives on the Products page instead (next to that product's
// other content), not here.
export default function SeoAdminPage() {
  return (
    <AdminShell title="SEO" subtitle="Meta title/description, social share image, canonical URL and noindex for categories and static pages.">
      {(token) => <SeoEntityPicker token={token} />}
    </AdminShell>
  );
}

function SeoEntityPicker({ token }) {
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // { type, id, label }

  useEffect(() => {
    fetch('/api/category')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((data) => setCategories(Array.isArray(data?.data) ? data.data : []))
      .catch(() => setCategoriesError('Could not load categories from the CRM.'))
      .finally(() => setLoading(false));
  }, []);

  if (selected) {
    return (
      <div>
        <button type="button" className="mb-4 text-sm font-semibold text-brand-600 hover:text-brand-700" onClick={() => setSelected(null)}>
          ← Back to all pages/categories
        </button>
        <div className="adm-card mb-5">
          <p className="adm-muted mb-0">
            {selected.type === 'category' ? 'Category' : 'Static page'}
          </p>
          <p className="text-lg font-semibold text-zinc-900">{selected.label}</p>
        </div>
        <SeoMetaEditor entityType={selected.type} entityId={selected.id} token={token} />
      </div>
    );
  }

  return (
    <div>
      <div className="adm-card mb-5">
        <h3 className="mb-3 mt-0 font-semibold text-zinc-900">Static pages</h3>
        <div className="flex flex-wrap gap-2">
          {STATIC_PAGES.map((page) => (
            <button
              key={page.id}
              type="button"
              className="adm-btn adm-btn-ghost"
              onClick={() => setSelected({ type: 'page', id: page.id, label: page.label })}
            >
              {page.label}
            </button>
          ))}
        </div>
      </div>

      <div className="adm-card">
        <h3 className="mb-3 mt-0 font-semibold text-zinc-900">Categories</h3>
        {categoriesError ? <p className="adm-error">{categoriesError}</p> : null}
        {loading ? (
          <p className="adm-muted">Loading categories…</p>
        ) : categories.length === 0 ? (
          <p className="adm-muted">No categories found.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {categories.map((cat) => (
              <div key={cat.id}>
                <button
                  type="button"
                  className="adm-btn adm-btn-ghost"
                  onClick={() => setSelected({ type: 'category', id: cat.id, label: cat.name })}
                >
                  {cat.name}
                </button>
                {cat.subcategories.length ? (
                  <div className="mt-2 ml-4 flex flex-wrap gap-2">
                    {cat.subcategories.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        className="adm-btn adm-btn-ghost"
                        onClick={() => setSelected({ type: 'category', id: sub.id, label: sub.name })}
                      >
                        {sub.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

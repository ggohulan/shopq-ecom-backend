'use client';

import { useEffect, useState } from 'react';

// Shared form for one entity's SEO override (product/category/page) - see
// GET/PUT /api/seo-meta and HANDOVER-seo-management.md. Used both embedded
// in the Products page (per-product) and standalone on /admin/seo
// (categories + static pages). Loads and saves independently of whatever
// page embeds it - same "own fetch, own Save button" pattern as
// ProductImagesEditor in product-content/page.js.
const TITLE_LIMIT = 70;
const DESCRIPTION_LIMIT = 160;

const EMPTY = { metaTitle: '', metaDescription: '', ogImageUrl: '', canonicalUrl: '', isNoindex: false };

export default function SeoMetaEditor({ entityType, entityId, token, heading = 'SEO' }) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setSaveState({ status: 'idle', message: '' });
    fetch(`/api/seo-meta?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((data) => {
        if (cancelled) return;
        setForm({
          metaTitle: data?.metaTitle || '',
          metaDescription: data?.metaDescription || '',
          ogImageUrl: data?.ogImageUrl || '',
          canonicalUrl: data?.canonicalUrl || '',
          isNoindex: !!data?.isNoindex,
        });
      })
      .catch(() => {
        if (!cancelled) setError('Could not load existing SEO data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveState({ status: 'saving', message: '' });
    try {
      const res = await fetch('/api/seo-meta', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ entityType, entityId, ...form }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || 'Failed to save');
      setSaveState({ status: 'success', message: 'Saved.' });
    } catch (err) {
      setSaveState({ status: 'error', message: err.message || 'Failed to save' });
    }
  };

  if (loading) return <p className="adm-muted">Loading SEO data…</p>;

  return (
    <form onSubmit={handleSave} className="adm-card">
      <h3 className="mb-1 mt-0 font-semibold text-zinc-900">{heading}</h3>
      {error ? <p className="adm-error">{error}</p> : null}

      <div className="adm-field">
        <label className="adm-label">Meta title</label>
        <p className="adm-hint">Falls back to the {entityType}'s own name when left blank.</p>
        <input
          type="text"
          value={form.metaTitle}
          onChange={(e) => setForm((f) => ({ ...f, metaTitle: e.target.value.slice(0, TITLE_LIMIT) }))}
          maxLength={TITLE_LIMIT}
          className="adm-input"
        />
        <p className={`adm-hint mt-1 text-right ${form.metaTitle.length > TITLE_LIMIT - 10 ? 'text-amber-600' : ''}`}>
          {form.metaTitle.length}/{TITLE_LIMIT}
        </p>
      </div>

      <div className="adm-field">
        <label className="adm-label">Meta description</label>
        <textarea
          value={form.metaDescription}
          onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value.slice(0, DESCRIPTION_LIMIT) }))}
          maxLength={DESCRIPTION_LIMIT}
          rows={3}
          className="adm-input"
        />
        <p className={`adm-hint mt-1 text-right ${form.metaDescription.length > DESCRIPTION_LIMIT - 20 ? 'text-amber-600' : ''}`}>
          {form.metaDescription.length}/{DESCRIPTION_LIMIT}
        </p>
      </div>

      <div className="adm-field">
        <label className="adm-label">Social share image (OG image) URL</label>
        <p className="adm-hint">Falls back to the primary product photo (products only) when left blank.</p>
        <input
          type="text"
          value={form.ogImageUrl}
          onChange={(e) => setForm((f) => ({ ...f, ogImageUrl: e.target.value }))}
          className="adm-input"
          placeholder="https://…"
        />
      </div>

      <div className="adm-field">
        <label className="adm-label">Canonical URL</label>
        <p className="adm-hint">Only set this if this page's content is duplicated elsewhere and search engines should prefer a different address.</p>
        <input
          type="text"
          value={form.canonicalUrl}
          onChange={(e) => setForm((f) => ({ ...f, canonicalUrl: e.target.value }))}
          className="adm-input"
          placeholder="https://…"
        />
      </div>

      <div className="adm-field mb-0">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input
            type="checkbox"
            checked={form.isNoindex}
            onChange={(e) => setForm((f) => ({ ...f, isNoindex: e.target.checked }))}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Hide from search engines (noindex)
        </label>
      </div>

      <div className="adm-save-row mt-4">
        <button type="submit" className="adm-btn adm-btn-primary" disabled={saveState.status === 'saving'}>
          {saveState.status === 'saving' ? 'Saving…' : 'Save SEO'}
        </button>
        {saveState.message ? (
          <span className={saveState.status === 'error' ? 'adm-error mt-0' : 'adm-success'}>{saveState.message}</span>
        ) : null}
      </div>
    </form>
  );
}

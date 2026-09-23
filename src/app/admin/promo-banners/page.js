'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';


const BLANK = {
  id: null,
  theme: 'blue',
  badge: '',
  headline: '',
  sub: '',
  ctaText: 'Shop now',
  linkType: 'product',
  linkValue: '',
  imageUrl: '',
  sortOrder: 0,
  isActive: true,
};

export default function PromoBannersAdminPage() {
  return (
    <AdminShell
      title='Promo Banners'
      subtitle='Where this shows up: on the homepage, between the "Categories" row and "New Arrivals" — roughly a third of the way down the page. Add, edit, reorder, or turn any of them off below.'
     
    >
      {(token) => <BannerManager token={token} />}
    </AdminShell>
  );
}

// Same classnames and same small override block as the real homepage
// component (src/components/parisTheme/PromoBanners.jsx) - the site-wide
// SCSS bundle that styles them (public/assets/scss/layout/_promo-banners.scss)
// is already loaded on every page under [lng], including this one, so this
// preview looks exactly like the live card, not an approximation of it.
const PREVIEW_CSS = `
@media (min-width:768px){
.promo-banners__banner{padding:0;gap:0;flex-wrap:nowrap;align-items:stretch;min-height:176px}
.promo-banners__banner--blue{background:#cc2028}
.promo-banners__banner--brown{background:#0d0d2b}
.promo-banners__banner--blue .promo-banners__image-slot{background:#a81a21}
.promo-banners__banner--brown .promo-banners__image-slot{background:#1c1c45}
.promo-banners__banner .promo-banners__image-slot{order:-1;flex:0 0 42%;align-self:stretch;display:flex;align-items:center;justify-content:center;padding:16px}
.promo-banners__banner .promo-banners__product{position:static;inset:auto;max-width:100%;max-height:178px;width:auto;height:auto;object-fit:contain;object-position:center}
.promo-banners__banner .promo-banners__text{flex:1 1 0;justify-content:center;padding:var(--promo-pad) var(--promo-pad) var(--promo-pad) 24px}
.promo-banners__banner--blue .promo-banners__badge,.promo-banners__banner--brown .promo-banners__badge{background:rgba(255,255,255,.18);border:0;color:var(--canvas-color)}
.promo-banners__banner--blue .promo-banners__cta{background-color:#fff;color:#cc2028}
.promo-banners__banner--brown .promo-banners__cta{background-color:var(--secondary-color);color:#3a2a08}
}
.adm-preview-row{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px}
.adm-preview-slot{flex:1 1 300px;min-width:260px;position:relative}
.adm-preview-slot .promo-banners__banner{margin:0}
.adm-preview-tag{position:absolute;top:-10px;left:12px;background:#1a1a1a;color:#fff;font-size:11px;font-weight:700;letter-spacing:.04em;padding:3px 10px;border-radius:20px;z-index:2}
`;

function HomepagePreview({ banners }) {
  const active = banners.filter((b) => b.isActive);
  return (
    <div className='adm-card' style={{ marginBottom: 24 }}>
      <style>{PREVIEW_CSS}</style>
      <h3 style={{ marginTop: 0 }}>Homepage preview</h3>
      <p className='adm-muted' style={{ fontSize: 13, marginTop: -6 }}>
        Left-to-right, top-to-bottom is the same order shown in the table below. This is what real visitors will see right now.
      </p>
      {!active.length ? (
        <p className='adm-muted'>No active banners - the homepage is showing its built-in defaults instead of this list.</p>
      ) : (
        <div className='adm-preview-row'>
          {active.map((b, i) => (
            <div className='adm-preview-slot' key={b.id}>
              <span className='adm-preview-tag'>{i === 0 ? '1st - shows first / left' : i === 1 ? '2nd - shows second / right' : `${i + 1}${i === 2 ? 'rd' : 'th'} in order`}</span>
              <div className={`promo-banners__banner promo-banners__banner--${b.theme}`}>
                <div className='promo-banners__text'>
                  <span className='promo-banners__badge'>{b.badge}</span>
                  <h5 className='promo-banners__headline'>{b.headline}</h5>
                  <p className='promo-banners__sub'>{b.sub}</p>
                  <span className='promo-banners__cta'>{b.ctaText}</span>
                </div>
                <div className='promo-banners__image-slot'>
                  {b.imageUrl ? <img src={b.imageUrl} alt='' className='promo-banners__product' width={150} height={150} /> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BannerManager({ token }) {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    fetch('/api/promo-banners?all=1', { headers: { 'x-admin-token': token } })
      .then((res) => {
        if (res.status === 401) throw new Error('unauthorized');
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then((data) => setBanners(data.banners || []))
      .catch((err) => setError(err.message === 'unauthorized' ? 'Wrong or expired token.' : 'Could not load banners.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const startEdit = (banner) => setForm(banner ? { ...banner } : BLANK);
  const cancelEdit = () => setForm(BLANK);

  const save = async (e) => {
    e.preventDefault();
    if (!form.headline.trim() || !form.imageUrl.trim()) {
      setError('Headline and image URL are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const url = form.id ? `/api/promo-banners/${form.id}` : '/api/promo-banners';
      const method = form.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json())?.error || 'Save failed');
      setForm(BLANK);
      load();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this banner? This cannot be undone.')) return;
    setError('');
    try {
      const res = await fetch(`/api/promo-banners/${id}`, { method: 'DELETE', headers: { 'x-admin-token': token } });
      if (!res.ok) throw new Error('Delete failed');
      load();
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  const toggleActive = async (banner) => {
    setError('');
    try {
      const res = await fetch(`/api/promo-banners/${banner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ ...banner, isActive: !banner.isActive }),
      });
      if (!res.ok) throw new Error('Update failed');
      load();
    } catch (err) {
      setError(err.message || 'Update failed');
    }
  };

  // banners is already sorted by sortOrder from the API. Moving one swaps its
  // position in that list, then every banner gets renumbered to its new index
  // (0, 1, 2...) - simpler and more reliable than swapping raw sortOrder
  // values, which does nothing when two banners happen to share a number
  // (e.g. two freshly-added banners both defaulting to 0).
  const moveBanner = async (index, direction) => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= banners.length) return;
    const reordered = [...banners];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    setError('');
    try {
      await Promise.all(
        reordered.map((b, i) =>
          fetch(`/api/promo-banners/${b.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
            body: JSON.stringify({ ...b, sortOrder: i }),
          })
        )
      );
      load();
    } catch (err) {
      setError('Could not reorder banners.');
    }
  };

  // Position numbers shown to the admin should count only the banners that
  // actually appear on the homepage (matches HomepagePreview's "1st/2nd"
  // tags) - a hidden banner sitting between two active ones would otherwise
  // throw the table's #1/#2 numbering out of sync with what's live.
  let activePosition = 0;
  const positionLabels = banners.map((b) => (b.isActive ? String((activePosition += 1)) : '—'));

  return (
    <div>
      {error ? <p className='adm-error'>{error}</p> : null}

      {!loading ? <HomepagePreview banners={banners} /> : null}

      <div className='adm-card' style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>{form.id ? `Edit banner #${form.id}` : 'Add a new banner'}</h3>
        <form onSubmit={save}>
          <div className='adm-filters'>
            <div className='adm-field'>
              <label className='adm-label'>Color theme</label>
              <select className='adm-input' value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
                <option value='blue'>Blue</option>
                <option value='brown'>Brown</option>
              </select>
            </div>
            <div className='adm-field'>
              <label className='adm-label'>Active</label>
              <select className='adm-input' value={form.isActive ? '1' : '0'} onChange={(e) => setForm({ ...form, isActive: e.target.value === '1' })}>
                <option value='1'>Shown on site</option>
                <option value='0'>Hidden</option>
              </select>
            </div>
          </div>
          <p className='adm-muted' style={{ fontSize: 12, marginTop: -4 }}>
            Position on the page is set with the ↑ / ↓ buttons in the table below, not here.
          </p>

          <div className='adm-field' style={{ marginTop: 12 }}>
            <label className='adm-label'>Badge text (small label above the headline, e.g. "MONSOON READY")</label>
            <input className='adm-input' value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} maxLength={60} />
          </div>
          <div className='adm-field' style={{ marginTop: 12 }}>
            <label className='adm-label'>Headline *</label>
            <input className='adm-input' value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} maxLength={150} required />
          </div>
          <div className='adm-field' style={{ marginTop: 12 }}>
            <label className='adm-label'>Sub-text</label>
            <input className='adm-input' value={form.sub} onChange={(e) => setForm({ ...form, sub: e.target.value })} maxLength={255} />
          </div>
          <div className='adm-field' style={{ marginTop: 12 }}>
            <label className='adm-label'>Button text</label>
            <input className='adm-input' value={form.ctaText} onChange={(e) => setForm({ ...form, ctaText: e.target.value })} maxLength={60} />
          </div>

          <div className='adm-filters' style={{ marginTop: 12 }}>
            <div className='adm-field'>
              <label className='adm-label'>Link goes to</label>
              <select className='adm-input' value={form.linkType} onChange={(e) => setForm({ ...form, linkType: e.target.value })}>
                <option value='product'>A product (enter its product ID)</option>
                <option value='url'>A custom page (enter a path, e.g. /collections)</option>
              </select>
            </div>
            <div className='adm-field'>
              <label className='adm-label'>{form.linkType === 'product' ? 'Product ID' : 'Path or URL'}</label>
              <input className='adm-input' value={form.linkValue} onChange={(e) => setForm({ ...form, linkValue: e.target.value })} placeholder={form.linkType === 'product' ? '111' : '/collections'} />
            </div>
          </div>

          <div className='adm-field' style={{ marginTop: 12 }}>
            <label className='adm-label'>Image URL * (host the image yourself and paste the link - roughly square works best, ~300x300px)</label>
            <input className='adm-input' value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder='https://...' required />
          </div>

          {form.imageUrl ? (
            <div style={{ marginTop: 12 }}>
              <img src={form.imageUrl} alt='' style={{ maxWidth: 150, maxHeight: 150, objectFit: 'contain', border: '1px solid #e2e2e2', borderRadius: 6, padding: 8 }} onError={(e) => (e.target.style.display = 'none')} />
            </div>
          ) : null}

          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button type='submit' className='adm-btn adm-btn-primary' disabled={saving}>
              {saving ? 'Saving...' : form.id ? 'Save changes' : 'Add banner'}
            </button>
            {form.id ? (
              <button type='button' className='adm-btn adm-btn-ghost' onClick={cancelEdit}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>

      {loading ? (
        <p className='adm-muted'>Loading...</p>
      ) : !banners.length ? (
        <p className='adm-muted'>No banners yet - the homepage is showing its built-in defaults. Add one above.</p>
      ) : (
        <div className='adm-card' style={{ overflowX: 'auto', padding: 0 }}>
          <table className='adm-table'>
            <thead>
              <tr>
                <th>Preview</th>
                <th>Headline</th>
                <th>Theme</th>
                <th>Links to</th>
                <th style={{ textAlign: 'center' }}>Position</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {banners.map((b, i) => (
                <tr key={b.id}>
                  <td>
                    <img src={b.imageUrl} alt='' style={{ width: 48, height: 48, objectFit: 'contain' }} onError={(e) => (e.target.style.visibility = 'hidden')} />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{b.headline}</div>
                    <div className='adm-muted' style={{ fontSize: 12 }}>{b.badge}</div>
                  </td>
                  <td>{b.theme}</td>
                  <td>{b.linkType === 'product' ? `Product #${b.linkValue}` : b.linkValue}</td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-block', minWidth: 20, fontWeight: 600, marginRight: 8 }}>#{positionLabels[i]}</span>
                    <button
                      type='button'
                      className='adm-btn adm-btn-ghost'
                      onClick={() => moveBanner(i, -1)}
                      disabled={i === 0}
                      title='Move up'
                      aria-label='Move up'
                      style={{ padding: '4px 8px', marginRight: 4 }}
                    >
                      ↑
                    </button>
                    <button
                      type='button'
                      className='adm-btn adm-btn-ghost'
                      onClick={() => moveBanner(i, 1)}
                      disabled={i === banners.length - 1}
                      title='Move down'
                      aria-label='Move down'
                      style={{ padding: '4px 8px' }}
                    >
                      ↓
                    </button>
                  </td>
                  <td>
                    <span className={`adm-pill ${b.isActive ? 'adm-pill-ok' : 'adm-pill-warn'}`} style={{ cursor: 'pointer' }} onClick={() => toggleActive(b)}>
                      {b.isActive ? 'Shown' : 'Hidden'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type='button' className='adm-btn adm-btn-ghost' onClick={() => startEdit(b)} style={{ marginRight: 8 }}>
                      Edit
                    </button>
                    <button type='button' className='adm-btn adm-btn-ghost' onClick={() => remove(b.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

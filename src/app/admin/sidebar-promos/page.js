'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';


const BLANK = {
  id: null,
  cardType: 'checklist',
  badge: '',
  headlinePrefix: '',
  highlight: '',
  headlineSuffix: '',
  startLabel: '',
  midLabel: '',
  endLabel: '',
  headline: '',
  checklist: ['', '', ''],
  ctaText: 'Add to cart',
  imageUrl: '',
  productId: '',
  sortOrder: 0,
  isActive: true,
};

// Same classnames + same card-specific CSS as the real homepage component
// (src/components/parisTheme/SidebarPromo.jsx) - public/assets/scss's global
// bundle only carries the shared .sidebar-promo/.sidebar-promo__card shell;
// each template's own look (sp-red.../sp-gas...) lives in that component's
// own <style> block, so this preview copies it rather than approximating it.
const PREVIEW_CSS = `
.sidebar-promo .sp-red{background:#3a2a0b;padding:0;gap:0;min-height:420px;max-width:280px}
.sp-red .sp-top{padding:22px 20px 0;position:relative;z-index:1}
.sp-red .sp-badge{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:5px 14px;border-radius:999px;border:1px solid rgba(245,162,32,.7);color:#f5a220}
.sp-red .sp-headline{margin:14px 0 0;font-weight:700;font-size:21px;line-height:1.15;color:#fff}
.sp-red .sp-headline span{color:#f5a220}
.sp-red .sp-bar{margin-top:16px;height:9px;border-radius:999px;background:#241906;overflow:hidden}
.sp-red .sp-bar i{display:block;height:100%;width:38%;border-radius:999px;background:#f5a220}
.sp-red .sp-labels{display:flex;justify-content:space-between;gap:6px;margin-top:6px;font-size:11.5px;color:#e8d9b8}
.sp-red .sp-mid{flex:1 1 auto;position:relative;display:flex;align-items:center;justify-content:center;min-height:170px}
.sp-red .sp-circle{position:absolute;width:min(220px,80%);aspect-ratio:1;border-radius:50%;background:rgba(245,162,32,.18)}
.sp-red .sp-mid img{position:relative;width:min(140px,68%);height:auto}
.sp-red .sp-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;background:#241906;position:relative;z-index:1}
.sp-red .sp-price{font-size:21px;font-weight:700;color:#f5a220}
.sp-red .sp-cta{background:#f5a220;color:#3a2a08;padding:10px 18px;border-radius:999px;font-weight:600;font-size:14px;text-decoration:none;white-space:nowrap;margin-inline-start:auto}
.sp-red .sp-foot--noprice .sp-cta{flex:1;text-align:center;margin-inline-start:0}

.sidebar-promo .sp-gas{background:#0e5a52;padding:0;gap:0;min-height:420px;max-width:280px}
.sp-gas .sp-top{padding:22px 20px 0;position:relative;z-index:1}
.sp-gas .sp-badge{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:5px 14px;border-radius:999px;background:#ffb703;color:#3a1c00}
.sp-gas .sp-headline{margin:14px 0 0;font-weight:700;font-size:20px;line-height:1.15;color:#fff}
.sp-gas .sp-checks{list-style:none;margin:10px 0 0;padding:0}
.sp-gas .sp-checks li{display:flex;align-items:center;gap:12px;padding:9px 0;font-size:15px;font-weight:600;color:#fff;border-bottom:1px solid rgba(255,255,255,.14)}
.sp-gas .sp-checks li:last-child{border-bottom:0}
.sp-gas .sp-checks .sp-tick{flex:0 0 22px;width:22px;height:22px;border-radius:50%;background:#ffb703;color:#3a1c00;display:flex;align-items:center;justify-content:center;font-size:14px}
.sp-gas .sp-mid{flex:1 1 auto;display:flex;align-items:center;justify-content:center;min-height:140px;padding:6px 0}
.sp-gas .sp-frame{width:min(120px,58%);aspect-ratio:1;border-radius:50%;overflow:hidden;border:3px solid #ffb703;background:#0a4a43;display:flex}
.sp-gas .sp-frame img{width:100%;height:100%;object-fit:cover}
.sp-gas .sp-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 20px 20px;position:relative;z-index:1}
.sp-gas .sp-price{font-size:19px;font-weight:700;color:#ffb703}
.sp-gas .sp-price s{font-size:12px;font-weight:400;color:#cfe8e4;margin-inline-start:6px}
.sp-gas .sp-cta{background:#ffb703;color:#3a1c00;padding:10px 18px;border-radius:999px;font-weight:600;font-size:14px;text-decoration:none;white-space:nowrap;margin-inline-start:auto}
.sp-gas .sp-foot--noprice .sp-cta{flex:1;text-align:center;margin-inline-start:0}

.adm-sp-preview-row{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px}
.adm-sp-preview-slot{position:relative}
.adm-sp-preview-tag{position:absolute;top:-10px;left:12px;background:#1a1a1a;color:#fff;font-size:11px;font-weight:700;letter-spacing:.04em;padding:3px 10px;border-radius:20px;z-index:2}
`;

export default function SidebarPromosAdminPage() {
  return (
    <AdminShell
      title='Sidebar Promo Cards'
      subtitle='Where this shows up: on the homepage, in the sidebar next to the product listing (desktop screens 1200px and wider only - hidden on phones/tablets).'
     
    >
      {(token) => <CardManager token={token} />}
    </AdminShell>
  );
}

function PreviewCard({ card, tag }) {
  return (
    <div className='adm-sp-preview-slot'>
      <style>{PREVIEW_CSS}</style>
      <span className='adm-sp-preview-tag'>{tag}</span>
      {card.cardType === 'goal_tracker' ? (
        <div className='sidebar-promo__card sidebar-promo__card--brown sp-red'>
          <div className='sp-top'>
            <span className='sp-badge'>{card.badge}</span>
            <h5 className='sp-headline'>
              {card.headlinePrefix}
              <span>{card.highlight}</span>
              {card.headlineSuffix}
            </h5>
            <div className='sp-bar' aria-hidden='true'><i /></div>
            <div className='sp-labels'>
              <span>{card.startLabel}</span>
              <span>{card.midLabel}</span>
              <span>{card.endLabel}</span>
            </div>
          </div>
          <div className='sp-mid'>
            <span className='sp-circle' aria-hidden='true' />
            {card.imageUrl ? <img src={card.imageUrl} alt='' /> : null}
          </div>
          <div className='sp-foot'>
            <span className='sp-price'>Rs 0</span>
            <span className='sp-cta'>{card.ctaText}</span>
          </div>
        </div>
      ) : (
        <div className='sidebar-promo__card sp-gas'>
          <div className='sp-top'>
            <span className='sp-badge'>{card.badge}</span>
            <h5 className='sp-headline'>{card.headline}</h5>
            <ul className='sp-checks'>
              {(card.checklist || []).filter(Boolean).map((item, i) => (
                <li key={i}>
                  <span className='sp-tick' aria-hidden='true'>✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className='sp-mid'>
            <span className='sp-frame'>{card.imageUrl ? <img src={card.imageUrl} alt='' /> : null}</span>
          </div>
          <div className='sp-foot'>
            <span className='sp-price'>Rs 0</span>
            <span className='sp-cta'>{card.ctaText}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CardManager({ token }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    fetch('/api/sidebar-promos?all=1', { headers: { 'x-admin-token': token } })
      .then((res) => {
        if (res.status === 401) throw new Error('unauthorized');
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then((data) => setCards((data.cards || []).map((c) => ({ ...c, checklist: c.checklist?.length ? c.checklist : ['', '', ''] }))))
      .catch((err) => setError(err.message === 'unauthorized' ? 'Wrong or expired token.' : 'Could not load cards.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const startEdit = (card) => setForm(card ? { ...card, checklist: card.checklist?.length ? [...card.checklist, '', '', ''].slice(0, 3) : ['', '', ''] } : BLANK);
  const cancelEdit = () => setForm(BLANK);

  const save = async (e) => {
    e.preventDefault();
    if (!form.imageUrl.trim() || !form.productId.toString().trim()) {
      setError('Image URL and Product ID are required.');
      return;
    }
    if (form.cardType === 'goal_tracker' && !form.highlight.trim()) {
      setError('The highlighted amount is required for a goal tracker card.');
      return;
    }
    if (form.cardType === 'checklist' && !form.headline.trim()) {
      setError('Headline is required for a checklist card.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const url = form.id ? `/api/sidebar-promos/${form.id}` : '/api/sidebar-promos';
      const method = form.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ ...form, checklist: form.checklist.filter((s) => s.trim()) }),
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
    if (!window.confirm('Delete this card? This cannot be undone.')) return;
    setError('');
    try {
      const res = await fetch(`/api/sidebar-promos/${id}`, { method: 'DELETE', headers: { 'x-admin-token': token } });
      if (!res.ok) throw new Error('Delete failed');
      load();
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  const toggleActive = async (card) => {
    setError('');
    try {
      const res = await fetch(`/api/sidebar-promos/${card.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ ...card, isActive: !card.isActive }),
      });
      if (!res.ok) throw new Error('Update failed');
      load();
    } catch (err) {
      setError(err.message || 'Update failed');
    }
  };

  const moveCard = async (index, direction) => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= cards.length) return;
    const reordered = [...cards];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    setError('');
    try {
      await Promise.all(
        reordered.map((c, i) =>
          fetch(`/api/sidebar-promos/${c.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
            body: JSON.stringify({ ...c, sortOrder: i }),
          })
        )
      );
      load();
    } catch (err) {
      setError('Could not reorder cards.');
    }
  };

  const active = cards.filter((c) => c.isActive);
  let activePosition = 0;
  const positionLabels = cards.map((c) => (c.isActive ? String((activePosition += 1)) : '—'));

  return (
    <div>
      {error ? <p className='adm-error'>{error}</p> : null}

      {!loading ? (
        <div className='adm-card' style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>Homepage preview</h3>
          <p className='adm-muted' style={{ fontSize: 13, marginTop: -6 }}>
            Price shows as "Rs 0" here since it's normally pulled live from the linked product - it'll show the real price on the site.
          </p>
          {!active.length ? (
            <p className='adm-muted'>No active cards - the homepage is showing its built-in defaults instead of this list.</p>
          ) : (
            <div className='adm-sp-preview-row'>
              {active.map((c, i) => (
                <PreviewCard key={c.id} card={c} tag={i === 0 ? '1st - top' : i === 1 ? '2nd - below it' : `${i + 1}th in order`} />
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className='adm-card' style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>{form.id ? `Edit card #${form.id}` : 'Add a new card'}</h3>
        <form onSubmit={save}>
          <div className='adm-filters'>
            <div className='adm-field'>
              <label className='adm-label'>Card style</label>
              <select className='adm-input' value={form.cardType} onChange={(e) => setForm({ ...form, cardType: e.target.value })}>
                <option value='checklist'>Checklist (ticked benefits, e.g. "Gas Saver")</option>
                <option value='goal_tracker'>Goal tracker (progress bar, e.g. "Savings challenge")</option>
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
            <label className='adm-label'>Badge text</label>
            <input className='adm-input' value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} maxLength={60} />
          </div>

          {form.cardType === 'goal_tracker' ? (
            <>
              <div className='adm-filters' style={{ marginTop: 12 }}>
                <div className='adm-field'>
                  <label className='adm-label'>Headline - text before the highlight</label>
                  <input className='adm-input' value={form.headlinePrefix} onChange={(e) => setForm({ ...form, headlinePrefix: e.target.value })} placeholder='Save ' maxLength={60} />
                </div>
                <div className='adm-field'>
                  <label className='adm-label'>Headline - highlighted amount *</label>
                  <input className='adm-input' value={form.highlight} onChange={(e) => setForm({ ...form, highlight: e.target.value })} placeholder='Rs 100,000' maxLength={60} required />
                </div>
                <div className='adm-field'>
                  <label className='adm-label'>Headline - text after the highlight</label>
                  <input className='adm-input' value={form.headlineSuffix} onChange={(e) => setForm({ ...form, headlineSuffix: e.target.value })} placeholder=' in one box' maxLength={60} />
                </div>
              </div>
              <div className='adm-filters' style={{ marginTop: 12 }}>
                <div className='adm-field'>
                  <label className='adm-label'>Progress bar - start label</label>
                  <input className='adm-input' value={form.startLabel} onChange={(e) => setForm({ ...form, startLabel: e.target.value })} placeholder='Rs 0' maxLength={30} />
                </div>
                <div className='adm-field'>
                  <label className='adm-label'>Progress bar - middle label</label>
                  <input className='adm-input' value={form.midLabel} onChange={(e) => setForm({ ...form, midLabel: e.target.value })} placeholder='Mark it, deposit it' maxLength={60} />
                </div>
                <div className='adm-field'>
                  <label className='adm-label'>Progress bar - end label</label>
                  <input className='adm-input' value={form.endLabel} onChange={(e) => setForm({ ...form, endLabel: e.target.value })} placeholder='Rs 100,000' maxLength={30} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className='adm-field' style={{ marginTop: 12 }}>
                <label className='adm-label'>Headline *</label>
                <input className='adm-input' value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} maxLength={150} required />
              </div>
              <div className='adm-field' style={{ marginTop: 12 }}>
                <label className='adm-label'>Checklist (up to 3 lines, blank ones are dropped)</label>
                {[0, 1, 2].map((i) => (
                  <input
                    key={i}
                    className='adm-input'
                    style={{ marginTop: 6 }}
                    value={form.checklist[i] || ''}
                    onChange={(e) => {
                      const next = [...form.checklist];
                      next[i] = e.target.value;
                      setForm({ ...form, checklist: next });
                    }}
                    maxLength={40}
                    placeholder={`Line ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}

          <div className='adm-field' style={{ marginTop: 12 }}>
            <label className='adm-label'>Button text</label>
            <input className='adm-input' value={form.ctaText} onChange={(e) => setForm({ ...form, ctaText: e.target.value })} maxLength={60} />
          </div>

          <div className='adm-filters' style={{ marginTop: 12 }}>
            <div className='adm-field'>
              <label className='adm-label'>Product ID * (this drives the live price shown, and where the button links to)</label>
              <input className='adm-input' value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} placeholder='90' required />
            </div>
          </div>

          <div className='adm-field' style={{ marginTop: 12 }}>
            <label className='adm-label'>Image URL * (goal tracker: tall product shot, ~190x190px. Checklist: fills a circle, ~150x150px)</label>
            <input className='adm-input' value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder='https://...' required />
          </div>

          {form.imageUrl ? (
            <div style={{ marginTop: 12 }}>
              <img src={form.imageUrl} alt='' style={{ maxWidth: 150, maxHeight: 150, objectFit: 'contain', border: '1px solid #e2e2e2', borderRadius: 6, padding: 8 }} onError={(e) => (e.target.style.display = 'none')} />
            </div>
          ) : null}

          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button type='submit' className='adm-btn adm-btn-primary' disabled={saving}>
              {saving ? 'Saving...' : form.id ? 'Save changes' : 'Add card'}
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
      ) : !cards.length ? (
        <p className='adm-muted'>No cards yet - the homepage is showing its built-in defaults. Add one above.</p>
      ) : (
        <div className='adm-card' style={{ overflowX: 'auto', padding: 0 }}>
          <table className='adm-table'>
            <thead>
              <tr>
                <th>Preview</th>
                <th>Card</th>
                <th>Style</th>
                <th>Product</th>
                <th style={{ textAlign: 'center' }}>Position</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c, i) => (
                <tr key={c.id}>
                  <td>
                    <img src={c.imageUrl} alt='' style={{ width: 48, height: 48, objectFit: 'contain' }} onError={(e) => (e.target.style.visibility = 'hidden')} />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.cardType === 'goal_tracker' ? `${c.headlinePrefix}${c.highlight}${c.headlineSuffix}` : c.headline}</div>
                    <div className='adm-muted' style={{ fontSize: 12 }}>{c.badge}</div>
                  </td>
                  <td>{c.cardType === 'goal_tracker' ? 'Goal tracker' : 'Checklist'}</td>
                  <td>#{c.productId}</td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-block', minWidth: 20, fontWeight: 600, marginRight: 8 }}>#{positionLabels[i]}</span>
                    <button type='button' className='adm-btn adm-btn-ghost' onClick={() => moveCard(i, -1)} disabled={i === 0} title='Move up' aria-label='Move up' style={{ padding: '4px 8px', marginRight: 4 }}>
                      ↑
                    </button>
                    <button type='button' className='adm-btn adm-btn-ghost' onClick={() => moveCard(i, 1)} disabled={i === cards.length - 1} title='Move down' aria-label='Move down' style={{ padding: '4px 8px' }}>
                      ↓
                    </button>
                  </td>
                  <td>
                    <span className={`adm-pill ${c.isActive ? 'adm-pill-ok' : 'adm-pill-warn'}`} style={{ cursor: 'pointer' }} onClick={() => toggleActive(c)}>
                      {c.isActive ? 'Shown' : 'Hidden'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type='button' className='adm-btn adm-btn-ghost' onClick={() => startEdit(c)} style={{ marginRight: 8 }}>
                      Edit
                    </button>
                    <button type='button' className='adm-btn adm-btn-ghost' onClick={() => remove(c.id)}>
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

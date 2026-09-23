'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';


export default function SiteOfferAdminPage() {
  return (
    <AdminShell
      title='Site-wide Offer'
      subtitle='The "20% off your first order" offer. One value here updates the homepage hero banner, the exit pop-up, and the newsletter band all at once - they used to be three separate copies you had to change by hand. The top bar message is also updated automatically if it still uses the old code/amount.'
     
    >
      {(token) => <OfferEditor token={token} />}
    </AdminShell>
  );
}

function OfferEditor({ token }) {
  const [discountLabel, setDiscountLabel] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch('/api/site-offer')
      .then((res) => res.json())
      .then((data) => {
        setDiscountLabel(data.discountLabel || '');
        setCode(data.code || '');
      })
      .catch(() => setError('Could not load the current offer.'))
      .finally(() => setLoading(false));
  }, [token]);

  const save = async (e) => {
    e.preventDefault();
    if (!discountLabel.trim() || !code.trim()) {
      setError('Both fields are required.');
      return;
    }
    setSaving(true);
    setError('');
    setSavedAt(null);
    try {
      const res = await fetch('/api/site-offer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ discountLabel: discountLabel.trim(), code: code.trim().toUpperCase() }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || 'Save failed');
      setCode(code.trim().toUpperCase());
      setSavedAt(new Date());
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className='adm-muted'>Loading...</p>;

  return (
    <div>
      {error ? <p className='adm-error'>{error}</p> : null}
      {savedAt ? <p className='adm-muted' style={{ color: '#1a7a3a' }}>Saved. Live everywhere within a few seconds.</p> : null}

      <div className='adm-card' style={{ marginBottom: 24, maxWidth: 480 }}>
        <form onSubmit={save}>
          <div className='adm-field'>
            <label className='adm-label'>Discount amount (shown as text, e.g. "20%" or "Rs 500")</label>
            <input className='adm-input' value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} maxLength={20} required />
          </div>
          <div className='adm-field' style={{ marginTop: 12 }}>
            <label className='adm-label'>Promo code (must also be live in the CRM before saving here)</label>
            <input className='adm-input' value={code} onChange={(e) => setCode(e.target.value)} maxLength={30} style={{ textTransform: 'uppercase' }} required />
          </div>
          <div style={{ marginTop: 16 }}>
            <button type='submit' className='adm-btn adm-btn-primary' disabled={saving}>
              {saving ? 'Saving...' : 'Save offer'}
            </button>
          </div>
        </form>
      </div>

      <div className='adm-card'>
        <h3 style={{ marginTop: 0 }}>Preview of the wording used everywhere</h3>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Homepage hero: <b>Get {discountLabel || '__'} off your first order</b> — use code <b>{code || '__'}</b></li>
          <li>Exit pop-up: <b>Get {discountLabel || '__'} off your first order</b> — use code <b>{code || '__'}</b> at checkout</li>
          <li>Newsletter band: <b>Your {discountLabel || '__'} off code is ready</b> — <b>{code || '__'}</b></li>
          <li>Top bar: substituted in automatically only if it still contains the old code/amount</li>
        </ul>
      </div>
    </div>
  );
}

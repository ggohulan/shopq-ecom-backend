'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import request from '@/utils/axiosUtils';


function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function CartAbandonmentAdminPage() {
  return (
    <AdminShell
      title='Abandoned Carts'
      subtitle="Items added to cart and not purchased or removed within the window. Guests show only an anonymous ID — there's no contact to follow up with; logged-in customers show a consumer ID to look up in the CRM."
     
    >
      {(token) => <AbandonmentList token={token} />}
    </AdminShell>
  );
}

function AbandonmentList({ token }) {
  const [windowHours, setWindowHours] = useState(6);
  const [carts, setCarts] = useState([]);
  const [productNames, setProductNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/cart-abandonment?windowHours=${windowHours}`, { headers: { 'x-admin-token': token } })
      .then((res) => {
        if (res.status === 401) throw new Error('unauthorized');
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setCarts(data.carts || []);
        const ids = [...new Set((data.carts || []).map((c) => c.productId).filter(Boolean))];
        if (ids.length) {
          request({ url: '/product', params: { ids: ids.join(','), per_page: ids.length } })
            .then((res) => {
              if (cancelled) return;
              const names = {};
              (res?.data?.data || []).forEach((p) => { names[String(p.id)] = p.name; });
              setProductNames(names);
            })
            .catch(() => {});
        }
      })
      .catch((err) => !cancelled && setError(err.message === 'unauthorized' ? 'Wrong or expired token.' : 'Could not load abandoned carts.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [windowHours, token]);

  const totalValue = useMemo(() => carts.reduce((sum, c) => sum + (c.value || 0), 0), [carts]);

  return (
    <div>
      <div className='adm-filters'>
        <div className='adm-field'>
          <label className='adm-label'>Abandoned for at least</label>
          <select value={windowHours} onChange={(e) => setWindowHours(Number(e.target.value))} className='adm-input'>
            <option value={1}>1 hour</option>
            <option value={6}>6 hours</option>
            <option value={24}>24 hours</option>
            <option value={72}>3 days</option>
          </select>
        </div>
      </div>

      {error ? <p className='adm-error'>{error}</p> : null}
      {loading ? (
        <p className='adm-muted'>Loading…</p>
      ) : !carts.length ? (
        <p className='adm-muted'>No abandoned carts in this window.</p>
      ) : (
        <>
          <p className='adm-muted' style={{ marginBottom: 16 }}>
            {carts.length} abandoned cart{carts.length === 1 ? '' : 's'}, Rs. {totalValue.toLocaleString()} in near-miss value.
          </p>
          <div className='adm-card' style={{ overflowX: 'auto', padding: 0 }}>
            <table className='adm-table'>
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Value</th>
                  <th>Abandoned</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {carts.map((c, i) => (
                  <tr key={i}>
                    <td>{productNames[c.productId] || `Product ${c.productId}`}</td>
                    <td style={{ textAlign: 'right' }}>{c.quantity}</td>
                    <td style={{ textAlign: 'right' }}>{c.value != null ? `Rs. ${c.value.toLocaleString()}` : '—'}</td>
                    <td>{timeAgo(c.abandonedAt)}</td>
                    <td>
                      {c.hasContact ? (
                        <span className='adm-pill adm-pill-ok'>Customer #{c.consumerId} — look up in CRM</span>
                      ) : (
                        <span className='adm-pill adm-pill-warn'>Guest — no contact</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

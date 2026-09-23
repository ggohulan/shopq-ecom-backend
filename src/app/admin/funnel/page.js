'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import request from '@/utils/axiosUtils';

const LOW_VIEW_TO_CART = 0.05; // below 5% view->cart: flag as a possible price/photo problem
const LOW_CART_TO_BUY = 0.2; // below 20% cart->buy: flag as possible checkout friction

function pct(n) {
  return n == null ? '—' : `${(n * 100).toFixed(0)}%`;
}

export default function FunnelAdminPage() {
  return (
    <AdminShell title='Conversion Funnel' subtitle='View → add to cart → checkout → purchase, by product. Unique visitors per stage, not raw hits.'>
      {(token) => <FunnelReport token={token} />}
    </AdminShell>
  );
}

function FunnelReport({ token }) {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState(null);
  const [productNames, setProductNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('views');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/funnel-report?days=${days}`, { headers: { 'x-admin-token': token } })
      .then((res) => {
        if (res.status === 401) throw new Error('unauthorized');
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        const ids = data.products.map((p) => p.productId).filter(Boolean);
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
      .catch((err) => !cancelled && setError(err.message === 'unauthorized' ? 'Wrong or expired token.' : 'Could not load the report.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days, token]);

  const sortedProducts = useMemo(() => {
    if (!report?.products) return [];
    return [...report.products].sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0));
  }, [report, sortBy]);

  return (
    <div>
      <div className='adm-filters'>
        <div className='adm-field'>
          <label className='adm-label'>Date range</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className='adm-input'>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        <div className='adm-field'>
          <label className='adm-label'>Sort by</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className='adm-input'>
            <option value='views'>Views</option>
            <option value='addToCarts'>Add to carts</option>
            <option value='purchases'>Purchases</option>
            <option value='revenue'>Revenue</option>
          </select>
        </div>
      </div>

      {report ? (
        <p className='adm-muted' style={{ marginBottom: 16 }}>
          Verification: <b>{report.loggedOrdersLast7Days}</b> distinct orders logged in the last 7 days — compare this against the CRM's real order count for the same period to confirm the numbers here are trustworthy.
        </p>
      ) : null}

      {error ? <p className='adm-error'>{error}</p> : null}
      {loading ? (
        <p className='adm-muted'>Loading…</p>
      ) : !sortedProducts.length ? (
        <p className='adm-muted'>No events logged yet for this range.</p>
      ) : (
        <div className='adm-card' style={{ overflowX: 'auto', padding: 0 }}>
          <table className='adm-table'>
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ textAlign: 'right' }}>Views</th>
                <th style={{ textAlign: 'right' }}>Add to cart</th>
                <th style={{ textAlign: 'right' }}>Checkout started</th>
                <th style={{ textAlign: 'right' }}>Purchases</th>
                <th style={{ textAlign: 'right' }}>View→Cart</th>
                <th style={{ textAlign: 'right' }}>Cart→Buy</th>
                <th style={{ textAlign: 'right' }}>Revenue</th>
                <th>Likely issue</th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map((p) => {
                const lowViewToCart = p.viewToCartRate != null && p.viewToCartRate < LOW_VIEW_TO_CART && p.views >= 20;
                const lowCartToBuy = p.cartToBuyRate != null && p.cartToBuyRate < LOW_CART_TO_BUY && p.addToCarts >= 10;
                return (
                  <tr key={p.productId}>
                    <td>{productNames[p.productId] || `Product ${p.productId}`}</td>
                    <td style={{ textAlign: 'right' }}>{p.views}</td>
                    <td style={{ textAlign: 'right' }}>{p.addToCarts}</td>
                    <td style={{ textAlign: 'right' }}>{p.checkoutStarts}</td>
                    <td style={{ textAlign: 'right' }}>{p.purchases}</td>
                    <td style={{ textAlign: 'right' }} className={lowViewToCart ? 'adm-flag' : ''}>{pct(p.viewToCartRate)}</td>
                    <td style={{ textAlign: 'right' }} className={lowCartToBuy ? 'adm-flag' : ''}>{pct(p.cartToBuyRate)}</td>
                    <td style={{ textAlign: 'right' }}>Rs. {p.revenue.toLocaleString()}</td>
                    <td>
                      {lowViewToCart ? <span className='adm-pill adm-pill-warn'>Price or photos?</span> : null}
                      {lowCartToBuy ? <span className='adm-pill adm-pill-bad'>Checkout friction?</span> : null}
                      {!lowViewToCart && !lowCartToBuy ? <span className='adm-pill adm-pill-ok'>Healthy</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

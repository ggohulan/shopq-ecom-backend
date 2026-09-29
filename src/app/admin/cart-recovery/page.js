'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STEP_LABEL = { 1: '1 — 1h reminder', 2: '2 — 24h follow-up', 3: '3 — 72h discount' };

export default function CartRecoveryAdminPage() {
  return (
    <AdminShell
      title='Cart Recovery'
      subtitle="Automated follow-up emails for logged-in shoppers who added something to their cart and didn't check out. See the Cart Recovery Proposal artifact for how the 3-step sequence and its expected recovery rate were scoped."
    >
      {(token) => <CartRecoveryDashboard token={token} />}
    </AdminShell>
  );
}

function CartRecoveryDashboard({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  const load = () => {
    fetch('/api/cart-recovery', { headers: { 'x-admin-token': token } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((body) => setData(body))
      .catch(() => setError('Could not load cart recovery data.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // Poll while a sweep might be running, same pattern as the Products
    // page's product-index sync status - so "Run sweep now" re-enables and
    // the log updates without a manual reload.
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [token]);

  const triggerSweep = async () => {
    setRunning(true);
    setError('');
    try {
      const res = await fetch('/api/cart-recovery', { method: 'POST', headers: { 'x-admin-token': token } });
      if (!res.ok) throw new Error((await res.json())?.error || 'Could not start sweep');
      load();
    } catch (err) {
      setError(err.message || 'Could not start sweep');
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <p className='adm-muted'>Loading…</p>;
  if (!data) return <p className='adm-error'>{error || 'Could not load cart recovery data.'}</p>;

  const { emailConfigured, status, counts, log } = data;
  const recoveryRate = counts.totalSent > 0 ? Math.round((counts.recoveredSessions / counts.totalSent) * 1000) / 10 : null;

  return (
    <div>
      {!emailConfigured ? (
        <div className='adm-card' style={{ marginBottom: 20, borderColor: '#fde68a', background: '#fffbeb' }}>
          <p style={{ margin: 0, fontWeight: 600 }}>Email isn&apos;t configured yet</p>
          <p className='adm-muted' style={{ margin: '4px 0 0' }}>
            Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and SMTP_FROM in .env.local on the server. The sweep keeps
            running on schedule either way, it just skips sending until those are set — nothing is lost, it&apos;ll pick up
            eligible carts the next time it runs once email is configured.
          </p>
        </div>
      ) : null}

      <div className='adm-card' style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <div>
          <p style={{ margin: 0, fontWeight: 600 }}>
            {status.running ? 'Sweep running…' : status.lastSummary ? `Last swept ${timeAgo(status.lastSummary.finishedAt)}` : 'Not swept yet'}
          </p>
          {status.lastSummary ? (
            <p className='adm-muted' style={{ margin: '4px 0 0' }}>
              Checked {status.lastSummary.checked}, sent {status.lastSummary.sent}, {status.lastSummary.skippedNoEmail} had no email on
              file, {status.lastSummary.errors} failed.
            </p>
          ) : null}
        </div>
        <button type='button' className='adm-btn adm-btn-primary' onClick={triggerSweep} disabled={running || status.running} style={{ marginLeft: 'auto' }}>
          {status.running ? 'Running…' : 'Run sweep now'}
        </button>
      </div>

      {error ? <p className='adm-error'>{error}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatTile label='Emails sent' value={counts.totalSent} />
        <StatTile label='Step 1 (1h)' value={counts.step1Sent} />
        <StatTile label='Step 2 (24h)' value={counts.step2Sent} />
        <StatTile label='Step 3 (72h)' value={counts.step3Sent} />
        <StatTile label='Recovered carts' value={counts.recoveredSessions} accent />
        <StatTile label='Recovery rate' value={recoveryRate != null ? `${recoveryRate}%` : '—'} accent />
      </div>

      {log.length === 0 ? (
        <p className='adm-muted'>No recovery emails sent yet.</p>
      ) : (
        <div className='adm-card' style={{ overflowX: 'auto', padding: 0 }}>
          <table className='adm-table'>
            <thead>
              <tr>
                <th>Email</th>
                <th>Step</th>
                <th>Sent</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {log.map((row, i) => (
                <tr key={i}>
                  <td>{row.email}</td>
                  <td>{STEP_LABEL[row.step] || row.step}</td>
                  <td>{timeAgo(row.sentAt)}</td>
                  <td>
                    {row.recovered ? (
                      <span className='adm-pill adm-pill-ok'>Purchased after</span>
                    ) : (
                      <span className='adm-pill adm-pill-warn'>Not yet</span>
                    )}
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

function StatTile({ label, value, accent }) {
  return (
    <div className='adm-card' style={{ padding: '14px 16px' }}>
      <p className='adm-muted' style={{ margin: 0, fontSize: 12 }}>
        {label}
      </p>
      <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 800, color: accent ? '#dc2626' : undefined }}>{value}</p>
    </div>
  );
}

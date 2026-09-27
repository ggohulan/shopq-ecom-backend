'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';

function Stars({ rating }) {
  return (
    <span className="tracking-tight text-amber-500" aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(rating)}
      <span className="text-zinc-300">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

function SourceBadge({ source }) {
  return source === 'imported' ? (
    <span className="adm-pill adm-pill-warn" title="Manually collected from elsewhere by an admin - never a ShopQ customer">
      Manufacturer review
    </span>
  ) : (
    <span className="adm-pill adm-pill-ok">Customer review</span>
  );
}

// Minimal but correct CSV parser - handles quoted fields (so a review that
// itself contains a comma or a newline doesn't split into extra columns)
// and "" as an escaped quote inside a quoted field, matching how Excel and
// Google Sheets both export. Returns an array of row arrays; the caller
// maps the header row to field names.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const CSV_COLUMNS = ['rating', 'authorName', 'reviewText', 'sourceUrl', 'sourceCountry'];

function csvRowsToReviews(rows) {
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  const knownHeader = CSV_COLUMNS.every((col) => header.includes(col));
  const dataRows = knownHeader ? rows.slice(1) : rows;
  const columns = knownHeader ? header : CSV_COLUMNS;

  return dataRows.map((cells) => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = (cells[i] || '').trim();
    });
    return obj;
  });
}

export default function ReviewsAdminPage() {
  return (
    <AdminShell
      title="Reviews"
      subtitle="Customer-submitted reviews and manually-imported reviews both land here for approval before anything shows publicly."
    >
      {(token) => <ReviewsManager token={token} />}
    </AdminShell>
  );
}

const BLANK_MANUAL = { productId: '', rating: 5, authorName: '', reviewText: '', sourceUrl: '', sourceCountry: '' };

function ReviewsManager({ token }) {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [reviews, setReviews] = useState([]);
  const [productNames, setProductNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [manualForm, setManualForm] = useState(BLANK_MANUAL);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualResult, setManualResult] = useState(null);
  const [manualError, setManualError] = useState('');

  const [csvProductId, setCsvProductId] = useState('');
  const [csvText, setCsvText] = useState('');
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState(null);
  const [csvError, setCsvError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    const qs = statusFilter === 'all' ? '' : `&status=${statusFilter}`;
    fetch(`/api/reviews?all=1${qs}`, { headers: { 'x-admin-token': token } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((data) => {
        const rows = data.reviews || [];
        setReviews(rows);
        const ids = [...new Set(rows.map((r) => r.productId).filter(Boolean))];
        if (ids.length) {
          fetch(`/api/product-index?ids=${ids.join(',')}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((body) => {
              if (!body) return;
              const names = {};
              (body.data || []).forEach((p) => {
                names[String(p.id)] = p.name;
              });
              setProductNames(names);
            })
            .catch(() => {});
        }
      })
      .catch(() => setError('Could not load reviews.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter, token]);

  const moderate = async (id, status) => {
    setError('');
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Update failed');
      load();
    } catch (err) {
      setError(err.message || 'Update failed');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this review? This cannot be undone.')) return;
    setError('');
    try {
      const res = await fetch(`/api/reviews/${id}`, { method: 'DELETE', headers: { 'x-admin-token': token } });
      if (!res.ok) throw new Error('Delete failed');
      load();
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  const submitManual = async (e) => {
    e.preventDefault();
    setManualSaving(true);
    setManualError('');
    setManualResult(null);
    try {
      const res = await fetch('/api/reviews/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({
          productId: manualForm.productId,
          reviews: [
            {
              rating: manualForm.rating,
              authorName: manualForm.authorName,
              reviewText: manualForm.reviewText,
              sourceUrl: manualForm.sourceUrl || null,
              sourceCountry: manualForm.sourceCountry || null,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Import failed');
      setManualResult(data.message);
      setManualForm({ ...BLANK_MANUAL, productId: manualForm.productId });
      if (statusFilter === 'pending' || statusFilter === 'all') load();
    } catch (err) {
      setManualError(err.message || 'Import failed');
    } finally {
      setManualSaving(false);
    }
  };

  const submitCsv = async (e) => {
    e.preventDefault();
    setCsvError('');
    setCsvResult(null);

    const parsedReviews = csvRowsToReviews(parseCsv(csvText));
    if (!parsedReviews.length) {
      setCsvError('Could not find any rows to import - check the CSV format below.');
      return;
    }

    setCsvImporting(true);
    try {
      const res = await fetch('/api/reviews/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ productId: csvProductId, reviews: parsedReviews }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Import failed');
      setCsvResult(data.message);
      setCsvText('');
      if (statusFilter === 'pending' || statusFilter === 'all') load();
    } catch (err) {
      setCsvError(err.message || 'Import failed');
    } finally {
      setCsvImporting(false);
    }
  };

  return (
    <div>
      <div className="adm-card mb-5">
        <h3 className="mb-1 mt-0 font-semibold text-zinc-900">Add one review manually</h3>
        <p className="adm-hint">
          For a review you've already collected yourself. Lands as pending — nothing shows publicly until you approve it.
        </p>
        <form onSubmit={submitManual}>
          <div className="adm-filters">
            <div className="adm-field min-w-[120px] flex-1">
              <label className="adm-label">Product ID</label>
              <input
                className="adm-input"
                value={manualForm.productId}
                onChange={(e) => setManualForm({ ...manualForm, productId: e.target.value })}
                placeholder="138"
                required
              />
            </div>
            <div className="adm-field w-24 flex-none">
              <label className="adm-label">Rating</label>
              <select
                className="adm-input"
                value={manualForm.rating}
                onChange={(e) => setManualForm({ ...manualForm, rating: e.target.value })}
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} star{n === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </div>
            <div className="adm-field min-w-[160px] flex-1">
              <label className="adm-label">Reviewer name (optional)</label>
              <input
                className="adm-input"
                value={manualForm.authorName}
                onChange={(e) => setManualForm({ ...manualForm, authorName: e.target.value })}
                placeholder="Anonymous"
              />
            </div>
          </div>

          <div className="adm-field">
            <label className="adm-label">Review text</label>
            <textarea
              className="adm-input"
              rows={3}
              value={manualForm.reviewText}
              onChange={(e) => setManualForm({ ...manualForm, reviewText: e.target.value })}
              required
            />
          </div>

          <div className="adm-filters">
            <div className="adm-field min-w-[200px] flex-1">
              <label className="adm-label">Source URL (optional)</label>
              <input
                className="adm-input"
                value={manualForm.sourceUrl}
                onChange={(e) => setManualForm({ ...manualForm, sourceUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="adm-field min-w-[120px] flex-1">
              <label className="adm-label">Reviewer country (optional)</label>
              <input
                className="adm-input"
                value={manualForm.sourceCountry}
                onChange={(e) => setManualForm({ ...manualForm, sourceCountry: e.target.value })}
                placeholder="Brazil"
              />
            </div>
          </div>

          <div className="adm-save-row">
            <button type="submit" className="adm-btn adm-btn-primary" disabled={manualSaving}>
              {manualSaving ? 'Adding…' : 'Add review'}
            </button>
            {manualError ? <span className="adm-error mt-0">{manualError}</span> : null}
            {manualResult ? <span className="adm-success">{manualResult}</span> : null}
          </div>
        </form>
      </div>

      <div className="adm-card mb-5">
        <h3 className="mb-1 mt-0 font-semibold text-zinc-900">Bulk import via CSV</h3>
        <p className="adm-hint">
          Paste rows copied from a spreadsheet. Columns: <code>rating,authorName,reviewText,sourceUrl,sourceCountry</code> — a header row
          is optional (if the first row doesn't look like a header, every row is treated as data in that column order).
          <code>authorName</code>, <code>sourceUrl</code>, and <code>sourceCountry</code> can be left blank per row.
        </p>
        <form onSubmit={submitCsv}>
          <div className="adm-field">
            <label className="adm-label">Product ID</label>
            <input
              className="adm-input max-w-xs"
              value={csvProductId}
              onChange={(e) => setCsvProductId(e.target.value)}
              placeholder="138"
              required
            />
          </div>
          <div className="adm-field">
            <label className="adm-label">CSV rows</label>
            <textarea
              className="adm-input font-mono text-xs"
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'rating,authorName,reviewText,sourceUrl,sourceCountry\n5,Jane D.,"Very bright, works great outdoors.",https://example.com/item/123,Brazil'}
              required
            />
          </div>
          <div className="adm-save-row">
            <button type="submit" className="adm-btn adm-btn-primary" disabled={csvImporting}>
              {csvImporting ? 'Importing…' : 'Import CSV'}
            </button>
            {csvError ? <span className="adm-error mt-0">{csvError}</span> : null}
            {csvResult ? <span className="adm-success">{csvResult}</span> : null}
          </div>
        </form>
      </div>

      <div className="adm-filters">
        <div className="adm-field">
          <label className="adm-label">Status</label>
          <select className="adm-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="pending">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {error ? <p className="adm-error">{error}</p> : null}

      {loading ? (
        <p className="adm-muted">Loading…</p>
      ) : reviews.length === 0 ? (
        <p className="adm-muted">Nothing here.</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="adm-card">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <SourceBadge source={r.source} />
                <span
                  className={`adm-pill ${r.status === 'approved' ? 'adm-pill-ok' : r.status === 'rejected' ? 'adm-pill-bad' : 'adm-pill-warn'}`}
                >
                  {r.status}
                </span>
                <Stars rating={r.rating} />
                <span className="ml-auto text-xs text-zinc-500">{productNames[r.productId] || `Product ${r.productId}`}</span>
              </div>
              <p className="mb-1 text-sm font-semibold text-zinc-900">
                {r.authorName}
                {r.sourceCountry ? <span className="ml-1.5 font-normal text-zinc-400">· {r.sourceCountry}</span> : null}
              </p>
              <p className="mb-3 whitespace-pre-wrap text-sm text-zinc-700">{r.reviewText}</p>
              <div className="flex flex-wrap gap-2">
                {r.status !== 'approved' ? (
                  <button type="button" className="adm-btn adm-btn-ghost" onClick={() => moderate(r.id, 'approved')}>
                    Approve
                  </button>
                ) : null}
                {r.status !== 'rejected' ? (
                  <button type="button" className="adm-btn adm-btn-ghost" onClick={() => moderate(r.id, 'rejected')}>
                    Reject
                  </button>
                ) : null}
                <button type="button" className="adm-btn adm-btn-ghost" onClick={() => remove(r.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

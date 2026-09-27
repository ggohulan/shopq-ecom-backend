'use client';

import { useEffect, useMemo, useState } from 'react';
import request from '@/utils/axiosUtils';
import AdminShell from '@/components/admin/AdminShell';
import { clearSessionToken } from '@/lib/adminSession';

// Internal tool, not part of the public site: browse the product catalog,
// pick one, and enter the Highlights / Key Features / Ideal For content that
// src/utils/customFunctions/useParsedProductDescription.js merges into the
// product detail page when the CRM description doesn't provide it. See the
// "product-content" plan doc for full background.
//
// Browsing/searching reads from /api/product-index (this backend's own DB),
// not the CRM directly - the CRM's product LIST endpoint (GET /products) is
// broken, stuck returning a fixed 23 results regardless of per_page or
// filters, even though the real catalog has 138+ products (see
// BUG-REPORT-crm-products-list.md). product_index is rebuilt by a daily
// background sync that probes the CRM's per-ID endpoint instead, which does
// work reliably - see src/lib/productIndexSync.js.
const PER_PAGE = 40;

const emptyFeatureRow = () => ({ title: '', desc: '' });
const emptySpecRow = () => ({ label: '', value: '' });

function formatPrice(n) {
  const num = Number(n);
  return Number.isFinite(num) ? `Rs. ${num.toLocaleString()}` : '—';
}

// A product with no photo (or a CRM photo URL that 404s) used to fall
// through to the browser's own broken-image glyph, which reads as "this
// product is broken" rather than "no photo yet". This renders a plain
// generic picture icon instead, in both cases.
function ProductThumb({ src, alt, className }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-zinc-100 text-zinc-300 ${className}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-2/5 w-2/5">
          <rect x="3" y="4" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="8.5" cy="9.5" r="1.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 16l-5.5-5.5a1.5 1.5 0 00-2.12 0L4 19" />
        </svg>
      </div>
    );
  }

  return <img src={src} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />;
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif';

// Product photo hosting - this backend is becoming the source of truth for
// every product image (replacing the CRM). Deliberately its own component
// and its own fetch, separate from the Features/Highlights form above: the
// two save independently (images upload immediately, content saves via its
// own Save button) and have unrelated loading/error states.
function ProductImagesEditor({ productId, token }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = () => {
    setLoading(true);
    setError('');
    fetch(`/api/product-images?productId=${encodeURIComponent(productId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((data) => setImages(data.images || []))
      .catch(() => setError('Could not load images.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [productId]);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same file(s) later
    if (!files.length) return;

    setUploading(true);
    setError('');
    // Uploaded one at a time, in order, rather than in parallel - a file
    // named with "main" (see looksLikeMainImage server-side) becomes primary
    // by clearing whichever image was primary before it, so if the batch
    // contains more than one "main"-ish name, the last one processed wins.
    // Sequential keeps that outcome predictable instead of racing.
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('productId', productId);
        form.append('file', file);
        const res = await fetch('/api/product-images', { method: 'POST', headers: { 'x-admin-token': token }, body: form });
        if (!res.ok) throw new Error((await res.json())?.error || `Upload failed for "${file.name}"`);
      }
      load();
    } catch (err) {
      setError(err.message || 'Upload failed');
      load(); // some files in the batch may have already succeeded
    } finally {
      setUploading(false);
    }
  };

  const setPrimary = async (id) => {
    setError('');
    try {
      const res = await fetch(`/api/product-images/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ isPrimary: true }),
      });
      if (!res.ok) throw new Error('Update failed');
      load();
    } catch (err) {
      setError(err.message || 'Update failed');
    }
  };

  const removeImage = async (id) => {
    if (!window.confirm('Delete this image? This cannot be undone.')) return;
    setError('');
    try {
      const res = await fetch(`/api/product-images/${id}`, { method: 'DELETE', headers: { 'x-admin-token': token } });
      if (!res.ok) throw new Error('Delete failed');
      load();
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  return (
    <div className="adm-card mb-5">
      <h3 className="mb-1 mt-0 font-semibold text-zinc-900">Product Images</h3>
      <p className="adm-hint">
        The image marked "Primary" is what listings/thumbnails use. JPG, PNG, WEBP, or GIF, up to 8MB. You can select several files at once — name one
        with "main" in it (e.g. "main.jpg") to make it primary automatically; otherwise the first image uploaded becomes primary.
      </p>

      {error ? <p className="adm-error">{error}</p> : null}

      {loading ? (
        <p className="adm-muted">Loading images…</p>
      ) : images.length === 0 ? (
        <p className="adm-muted mb-3">No images uploaded yet.</p>
      ) : (
        <div className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {images.map((img) => (
            <div key={img.id} className="relative overflow-hidden rounded-lg border border-zinc-200">
              <ProductThumb src={img.url} alt="" className="aspect-square w-full object-cover" />
              {img.isPrimary ? <span className="adm-pill adm-pill-ok absolute left-1.5 top-1.5">Primary</span> : null}
              <div className="flex divide-x divide-zinc-200 border-t border-zinc-200 text-xs">
                {!img.isPrimary ? (
                  <button type="button" className="flex-1 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-50" onClick={() => setPrimary(img.id)}>
                    Set primary
                  </button>
                ) : null}
                <button type="button" className={`flex-1 py-1.5 font-semibold text-red-600 hover:bg-red-50 ${img.isPrimary ? 'w-full' : ''}`} onClick={() => removeImage(img.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <label className="adm-btn adm-btn-ghost inline-flex cursor-pointer">
        {uploading ? 'Uploading…' : '+ Upload images'}
        <input type="file" accept={ACCEPTED_TYPES} multiple onChange={handleUpload} disabled={uploading} className="hidden" />
      </label>
    </div>
  );
}

function timeAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Status/manual-trigger for the background product_index sync (see
// src/instrumentation.js, src/lib/productIndexSync.js) - browsing/searching
// products reads from that local index, not the CRM directly, because the
// CRM's product LIST endpoint is broken (see BUG-REPORT-crm-products-list.md).
// This just surfaces "is it stale, and can I force a refresh" - the sync
// itself runs automatically once a day regardless of whether anyone opens
// this page.
function ProductIndexSyncStatus({ token, onSynced }) {
  const [status, setStatus] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = () =>
    fetch('/api/product-index/sync', { headers: { 'x-admin-token': token } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setStatus(data))
      .catch(() => {});

  useEffect(() => {
    loadStatus();
    // Poll while a sync might be running (e.g. someone else started it, or
    // the daily scheduled run kicked off) so "Sync now" re-enables and the
    // "last synced" line updates without needing a manual page reload.
    const id = setInterval(loadStatus, 10000);
    return () => clearInterval(id);
  }, [token]);

  const triggerSync = async () => {
    setStarting(true);
    setError('');
    try {
      const res = await fetch('/api/product-index/sync', { method: 'POST', headers: { 'x-admin-token': token } });
      if (!res.ok) throw new Error((await res.json())?.error || 'Could not start sync');
      await loadStatus();
    } catch (err) {
      setError(err.message || 'Could not start sync');
    } finally {
      setStarting(false);
      onSynced?.();
    }
  };

  const summary = status?.lastSummary;
  const running = !!status?.running;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
      <span>
        {running
          ? 'Syncing with the CRM…'
          : summary
            ? `Synced ${summary.active} products (${timeAgo(summary.finishedAt)})`
            : 'Not synced yet'}
      </span>
      <button type="button" className="adm-btn adm-btn-ghost adm-btn-icon" onClick={triggerSync} disabled={starting || running}>
        {running ? 'Syncing…' : 'Sync now'}
      </button>
      {error ? <span className="adm-error mt-0">{error}</span> : null}
    </div>
  );
}

export default function ProductContentAdminPage() {
  return (
    <AdminShell
      title="Products"
      subtitle="Images, Highlights, Key Features, and Ideal For content for products the CRM doesn't already provide it for."
    >
      {(token) => <ProductContentEditor token={token} />}
    </AdminShell>
  );
}

function ProductContentEditor({ token }) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState('');

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [hasExistingContent, setHasExistingContent] = useState(false);

  const [featuresText, setFeaturesText] = useState('');
  const [highlightsText, setHighlightsText] = useState('');
  const [keyFeatures, setKeyFeatures] = useState([emptyFeatureRow()]);
  const [idealFor, setIdealFor] = useState('');
  const [loveItText, setLoveItText] = useState('');
  const [specifications, setSpecifications] = useState([emptySpecRow()]);
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' });
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PER_PAGE)), [total]);

  // Debounced search - waits for the user to stop typing before refetching.
  useEffect(() => {
    const id = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    if (selectedProduct) return;
    let cancelled = false;
    setProductsLoading(true);
    setProductsError('');

    fetch(`/api/product-index?search=${encodeURIComponent(search)}&page=${page}&per_page=${PER_PAGE}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((body) => {
        if (cancelled) return;
        setProducts(Array.isArray(body?.data) ? body.data : []);
        setTotal(Number(body?.total) || 0);
      })
      .catch(() => {
        if (cancelled) return;
        setProductsError('Could not load products.');
        setProducts([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [search, page, selectedProduct, refreshKey]);

  const resetForm = () => {
    setFeaturesText('');
    setHighlightsText('');
    setKeyFeatures([emptyFeatureRow()]);
    setIdealFor('');
    setLoveItText('');
    setSpecifications([emptySpecRow()]);
    setSaveState({ status: 'idle', message: '' });
    setHasExistingContent(false);
  };

  const handleSelectProduct = async (product) => {
    setSelectedProduct(product);
    resetForm();
    setContentLoading(true);

    try {
      const res = await request({ url: `/product-content/${product.id}` });
      const existing = res?.data;
      if (existing?.features?.length) setFeaturesText(existing.features.join('\n'));
      if (existing?.highlights?.length) setHighlightsText(existing.highlights.join('\n'));
      if (existing?.keyFeatures?.length) setKeyFeatures(existing.keyFeatures);
      if (existing?.idealFor) setIdealFor(existing.idealFor);
      if (existing?.loveIt?.length) setLoveItText(existing.loveIt.join('\n'));
      if (existing?.specifications?.length) setSpecifications(existing.specifications);
      setHasExistingContent(
        !!(
          existing?.features?.length ||
          existing?.highlights?.length ||
          existing?.keyFeatures?.length ||
          existing?.idealFor ||
          existing?.loveIt?.length ||
          existing?.specifications?.length
        )
      );
    } catch (err) {
      // No existing content - form just stays blank.
    } finally {
      setContentLoading(false);
    }
  };

  const handleBackToList = () => {
    setSelectedProduct(null);
    resetForm();
  };

  const updateFeatureRow = (index, field, value) => {
    setKeyFeatures((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const addFeatureRow = () => setKeyFeatures((rows) => [...rows, emptyFeatureRow()]);
  const removeFeatureRow = (index) => setKeyFeatures((rows) => rows.filter((_, i) => i !== index));

  const updateSpecRow = (index, field, value) => {
    setSpecifications((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const addSpecRow = () => setSpecifications((rows) => [...rows, emptySpecRow()]);
  const removeSpecRow = (index) => setSpecifications((rows) => rows.filter((_, i) => i !== index));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedProduct?.id) return;

    setSaveState({ status: 'saving', message: '' });

    const features = featuresText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const highlights = highlightsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const cleanedFeatures = keyFeatures.filter((row) => row.title?.trim());
    const loveIt = loveItText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const cleanedSpecs = specifications.filter((row) => row.label?.trim());

    try {
      await request({
        url: `/product-content/${selectedProduct.id}`,
        method: 'put',
        headers: { 'x-admin-token': token },
        data: {
          features,
          highlights,
          keyFeatures: cleanedFeatures,
          idealFor: idealFor.trim(),
          loveIt,
          specifications: cleanedSpecs,
        },
      });
      setSaveState({ status: 'success', message: 'Saved — check the live product page to confirm.' });
      setHasExistingContent(
        features.length > 0 ||
          highlights.length > 0 ||
          cleanedFeatures.length > 0 ||
          !!idealFor.trim() ||
          loveIt.length > 0 ||
          cleanedSpecs.length > 0
      );
    } catch (err) {
      if (err?.response?.status === 401) {
        clearSessionToken();
        setSaveState({ status: 'error', message: 'Session expired — please sign in again.' });
      } else {
        setSaveState({ status: 'error', message: 'Failed to save. Check the console for details.' });
      }
    }
  };

  // Fills the form with an AI-drafted first pass (see
  // src/lib/productContentAi.js) - it never saves anything itself, so
  // nothing publishes until the admin reviews/edits it and clicks Save,
  // same as a manually-typed draft would.
  const generateWithAi = async () => {
    const hasDraftAlready =
      featuresText.trim() || highlightsText.trim() || idealFor.trim() || loveItText.trim() || keyFeatures.some((r) => r.title?.trim());
    if (hasDraftAlready && !window.confirm('This will replace the current unsaved form content with an AI draft. Continue?')) {
      return;
    }

    setAiGenerating(true);
    setAiError('');
    try {
      const res = await fetch('/api/product-content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ productId: selectedProduct.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Generation failed');

      const { draft } = data;
      setFeaturesText(draft.features.join('\n'));
      setHighlightsText(draft.highlights.join('\n'));
      setKeyFeatures(draft.keyFeatures.length ? draft.keyFeatures : [emptyFeatureRow()]);
      setIdealFor(draft.idealFor);
      setLoveItText(draft.loveIt.join('\n'));
      setSpecifications(draft.specifications.length ? draft.specifications : [emptySpecRow()]);
    } catch (err) {
      setAiError(err.message || 'Generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  if (selectedProduct) {
    return (
      <div>
        <button type="button" className="mb-4 text-sm font-semibold text-brand-600 hover:text-brand-700" onClick={handleBackToList}>
          ← Back to all products
        </button>

        <div className="adm-card mb-5 flex items-center gap-3.5">
          <ProductThumb
            src={selectedProduct.product_thumbnail?.original_url}
            alt={selectedProduct.name}
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
          <div>
            <p className="text-lg font-semibold text-zinc-900">{selectedProduct.name}</p>
            <p className="adm-muted">
              ID {selectedProduct.id}
              {hasExistingContent ? <span className="adm-pill adm-pill-ok ml-2">Has content</span> : null}
            </p>
          </div>
        </div>

        <ProductImagesEditor productId={selectedProduct.id} token={token} />

        {contentLoading ? (
          <p className="adm-muted">Loading existing content…</p>
        ) : (
          <>
            <div className="adm-card mb-5 flex flex-wrap items-center gap-3">
              <button type="button" className="adm-btn adm-btn-primary" onClick={generateWithAi} disabled={aiGenerating}>
                {aiGenerating ? 'Generating…' : '✨ Generate with AI'}
              </button>
              <span className="adm-muted">Drafts every field below from the product's name/CRM description — review and edit before saving.</span>
              {aiError ? <span className="adm-error mt-0">{aiError}</span> : null}
            </div>
            <form onSubmit={handleSave} className="adm-card">
            <div className="adm-field">
              <label className="adm-label">Features (one per line)</label>
              <p className="adm-hint">Shown right under the price on the product page.</p>
              <textarea
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                rows={4}
                className="adm-input"
                placeholder={'Keeps the cylinder warm in cold, windy weather.\nBlocks wind so the flame won\'t blow out.'}
              />
            </div>

            <div className="adm-field">
              <label className="adm-label">Highlights (one per line)</label>
              <p className="adm-hint">Shown further down the page, separately from Features above.</p>
              <textarea
                value={highlightsText}
                onChange={(e) => setHighlightsText(e.target.value)}
                rows={4}
                className="adm-input"
                placeholder={'Waterproof design\n2-year warranty'}
              />
            </div>

            <div className="adm-field">
              <label className="adm-label">Key Features</label>
              {keyFeatures.map((row, index) => (
                <div key={index} className="mb-2 flex gap-2">
                  <input
                    type="text"
                    placeholder="Title"
                    value={row.title}
                    onChange={(e) => updateFeatureRow(index, 'title', e.target.value)}
                    className="adm-input flex-1"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={row.desc}
                    onChange={(e) => updateFeatureRow(index, 'desc', e.target.value)}
                    className="adm-input flex-[2]"
                  />
                  <button type="button" className="adm-btn adm-btn-ghost shrink-0" onClick={() => removeFeatureRow(index)}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className="adm-btn adm-btn-ghost mt-1" onClick={addFeatureRow}>
                + Add feature
              </button>
            </div>

            <div className="adm-field">
              <label className="adm-label">Ideal For</label>
              <textarea
                value={idealFor}
                onChange={(e) => setIdealFor(e.target.value)}
                rows={3}
                className="adm-input"
                placeholder="Great for daily commuters and travelers."
              />
            </div>

            <div className="adm-field">
              <label className="adm-label">Why You&apos;ll Love It (one per line)</label>
              <p className="adm-hint">Shown as short pills, e.g. &quot;Fits both cylinder sizes&quot;.</p>
              <textarea
                value={loveItText}
                onChange={(e) => setLoveItText(e.target.value)}
                rows={3}
                className="adm-input"
                placeholder={'Fits both cylinder sizes\nBlocks wind, saves gas\n30-second setup'}
              />
            </div>

            <div className="adm-field">
              <label className="adm-label">Specifications</label>
              {specifications.map((row, index) => (
                <div key={index} className="mb-2 flex gap-2">
                  <input
                    type="text"
                    placeholder="Label (e.g. Material)"
                    value={row.label}
                    onChange={(e) => updateSpecRow(index, 'label', e.target.value)}
                    className="adm-input flex-1"
                  />
                  <input
                    type="text"
                    placeholder="Value (e.g. Heat-resistant woven fabric)"
                    value={row.value}
                    onChange={(e) => updateSpecRow(index, 'value', e.target.value)}
                    className="adm-input flex-[2]"
                  />
                  <button type="button" className="adm-btn adm-btn-ghost shrink-0" onClick={() => removeSpecRow(index)}>
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className="adm-btn adm-btn-ghost mt-1" onClick={addSpecRow}>
                + Add specification
              </button>
            </div>

            <div className="adm-save-row">
              <button type="submit" className="adm-btn adm-btn-primary" disabled={saveState.status === 'saving'}>
                {saveState.status === 'saving' ? 'Saving…' : 'Save'}
              </button>
              {saveState.message ? (
                <span className={saveState.status === 'error' ? 'adm-error mt-0' : 'adm-success'}>{saveState.message}</span>
              ) : null}
            </div>
          </form>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <ProductIndexSyncStatus token={token} onSynced={() => setRefreshKey((k) => k + 1)} />

      <div className="mb-5">
        <input
          type="search"
          placeholder="Search products by name…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="adm-input max-w-sm"
          autoFocus
        />
      </div>

      {productsError ? <p className="adm-error">{productsError}</p> : null}

      {productsLoading ? (
        <p className="adm-muted">Loading products…</p>
      ) : products.length === 0 ? (
        <p className="adm-muted">No products found{search ? ` for "${search}"` : ''}.</p>
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4">
          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => handleSelectProduct(product)}
              className="adm-card overflow-hidden p-0 text-left transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <ProductThumb src={product.product_thumbnail?.original_url} alt={product.name} className="aspect-square w-full object-cover" />
              <div className="p-3">
                <p className="mb-1 line-clamp-2 text-[13px] font-semibold text-zinc-900">{product.name}</p>
                <p className="flex items-center gap-2 text-xs text-zinc-600">
                  {formatPrice(product.selling_price ?? product.price)}
                  <span className={`adm-pill ${product.stock_status === 'in_stock' ? 'adm-pill-ok' : 'adm-pill-bad'}`}>
                    {product.stock_status === 'in_stock' ? 'In stock' : 'Out of stock'}
                  </span>
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-4">
          <button type="button" className="adm-btn adm-btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Previous
          </button>
          <span className="adm-muted">
            Page {page} of {totalPages}
          </span>
          <button type="button" className="adm-btn adm-btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </div>
      ) : null}
    </div>
  );
}

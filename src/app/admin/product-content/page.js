'use client';

import { useEffect, useMemo, useState } from 'react';
import request from '@/utils/axiosUtils';

// Internal tool, not part of the public site: browse the CRM's real product
// catalog (via the existing /api/product list proxy), pick one, and enter
// the Highlights / Key Features / Ideal For content that
// src/utils/customFunctions/useParsedProductDescription.js merges into the
// product detail page when the CRM description doesn't provide it. See the
// "product-content" plan doc for full background.
const TOKEN_STORAGE_KEY = 'shopq_admin_session';
const PER_PAGE = 12;

const emptyFeatureRow = () => ({ title: '', desc: '' });
const emptySpecRow = () => ({ label: '', value: '' });

function formatPrice(n) {
  const num = Number(n);
  return Number.isFinite(num) ? `Rs. ${num.toLocaleString()}` : '—';
}

export default function ProductContentAdminPage() {
  const [token, setToken] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [gateReady, setGateReady] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
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

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PER_PAGE)), [total]);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(TOKEN_STORAGE_KEY) : null;
    if (stored) setToken(stored);
    setGateReady(true);
  }, []);

  // Debounced search - waits for the user to stop typing before refetching.
  useEffect(() => {
    const id = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    if (!token || selectedProduct) return;
    let cancelled = false;
    setProductsLoading(true);
    setProductsError('');

    request({ url: '/product', params: { search, page, per_page: PER_PAGE } })
      .then((res) => {
        if (cancelled) return;
        const body = res?.data;
        setProducts(Array.isArray(body?.data) ? body.data : []);
        setTotal(Number(body?.total) || 0);
      })
      .catch(() => {
        if (cancelled) return;
        setProductsError('Could not load products from the CRM.');
        setProducts([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, search, page, selectedProduct]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setSigningIn(true);
    setLoginError('');
    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Login failed');
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      setToken(data.token);
      setPassword('');
    } catch (err) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setSigningIn(false);
    }
  };

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
        window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        setSaveState({ status: 'error', message: 'Session expired — please sign in again.' });
        setToken('');
      } else {
        setSaveState({ status: 'error', message: 'Failed to save. Check the console for details.' });
      }
    }
  };

  if (!gateReady) return null;

  if (!token) {
    return (
      <div className='pca-shell pca-center'>
        <form className='pca-card pca-gate' onSubmit={handleLogin}>
          <h1 className='pca-title'>Product Content Admin</h1>
          <p className='pca-subtitle'>Sign in to continue.</p>
          <div style={{ marginBottom: 14 }}>
            <label className='pca-label'>Username or email</label>
            <input type='text' autoComplete='username' value={identifier} onChange={(e) => setIdentifier(e.target.value)} className='pca-input' autoFocus />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label className='pca-label'>Password</label>
            <input type='password' autoComplete='current-password' value={password} onChange={(e) => setPassword(e.target.value)} className='pca-input' />
          </div>
          {loginError ? <p className='pca-error'>{loginError}</p> : null}
          <button type='submit' className='pca-btn pca-btn-primary' disabled={signingIn} style={{ width: '100%', marginTop: 12 }}>
            {signingIn ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <PcaStyles />
      </div>
    );
  }

  return (
    <div className='pca-shell'>
      <header className='pca-header'>
        <div>
          <h1 className='pca-title'>Product Content Admin</h1>
          <p className='pca-subtitle'>
            Add Highlights, Key Features, and Ideal For content for products the CRM doesn&apos;t already provide it for.
          </p>
        </div>
        <button
          type='button'
          className='pca-btn pca-btn-ghost'
          onClick={() => {
            window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
            setToken('');
          }}
        >
          Sign out
        </button>
      </header>

      {!selectedProduct ? (
        <>
          <div className='pca-search-row'>
            <input
              type='search'
              placeholder='Search products by name…'
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className='pca-input pca-search-input'
              autoFocus
            />
          </div>

          {productsError ? <p className='pca-error'>{productsError}</p> : null}

          {productsLoading ? (
            <p className='pca-muted'>Loading products…</p>
          ) : products.length === 0 ? (
            <p className='pca-muted'>No products found{search ? ` for "${search}"` : ''}.</p>
          ) : (
            <div className='pca-grid'>
              {products.map((product) => (
                <button key={product.id} type='button' className='pca-card pca-product-card' onClick={() => handleSelectProduct(product)}>
                  <div className='pca-product-thumb'>
                    {product.product_thumbnail?.original_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.product_thumbnail.original_url} alt={product.name} loading='lazy' />
                    ) : (
                      <div className='pca-thumb-placeholder' />
                    )}
                  </div>
                  <div className='pca-product-info'>
                    <p className='pca-product-name'>{product.name}</p>
                    <p className='pca-product-meta'>
                      {formatPrice(product.selling_price ?? product.price)}
                      <span className={`pca-badge ${product.stock_status === 'in_stock' ? 'pca-badge-ok' : 'pca-badge-out'}`}>
                        {product.stock_status === 'in_stock' ? 'In stock' : 'Out of stock'}
                      </span>
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {totalPages > 1 ? (
            <div className='pca-pagination'>
              <button type='button' className='pca-btn pca-btn-ghost' disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ← Previous
              </button>
              <span className='pca-muted'>
                Page {page} of {totalPages}
              </span>
              <button type='button' className='pca-btn pca-btn-ghost' disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next →
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <button type='button' className='pca-back-link' onClick={handleBackToList}>
            ← Back to all products
          </button>

          <div className='pca-card pca-selected-product'>
            {selectedProduct.product_thumbnail?.original_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedProduct.product_thumbnail.original_url} alt={selectedProduct.name} className='pca-selected-thumb' />
            ) : null}
            <div>
              <p className='pca-product-name' style={{ fontSize: 18 }}>
                {selectedProduct.name}
              </p>
              <p className='pca-muted'>
                ID {selectedProduct.id}
                {hasExistingContent ? <span className='pca-badge pca-badge-ok' style={{ marginLeft: 8 }}>Has content</span> : null}
              </p>
            </div>
          </div>

          {contentLoading ? (
            <p className='pca-muted'>Loading existing content…</p>
          ) : (
            <form onSubmit={handleSave} className='pca-card'>
              <div className='pca-field'>
                <label className='pca-label'>Features (one per line)</label>
                <p className='pca-hint'>Shown right under the price on the product page.</p>
                <textarea
                  value={featuresText}
                  onChange={(e) => setFeaturesText(e.target.value)}
                  rows={4}
                  className='pca-input'
                  placeholder={'Keeps the cylinder warm in cold, windy weather.\nBlocks wind so the flame won\'t blow out.'}
                />
              </div>

              <div className='pca-field'>
                <label className='pca-label'>Highlights (one per line)</label>
                <p className='pca-hint'>Shown further down the page, separately from Features above.</p>
                <textarea
                  value={highlightsText}
                  onChange={(e) => setHighlightsText(e.target.value)}
                  rows={4}
                  className='pca-input'
                  placeholder={'Waterproof design\n2-year warranty'}
                />
              </div>

              <div className='pca-field'>
                <label className='pca-label'>Key Features</label>
                {keyFeatures.map((row, index) => (
                  <div key={index} className='pca-feature-row'>
                    <input
                      type='text'
                      placeholder='Title'
                      value={row.title}
                      onChange={(e) => updateFeatureRow(index, 'title', e.target.value)}
                      className='pca-input'
                      style={{ flex: 1 }}
                    />
                    <input
                      type='text'
                      placeholder='Description (optional)'
                      value={row.desc}
                      onChange={(e) => updateFeatureRow(index, 'desc', e.target.value)}
                      className='pca-input'
                      style={{ flex: 2 }}
                    />
                    <button type='button' className='pca-btn pca-btn-ghost' onClick={() => removeFeatureRow(index)}>
                      Remove
                    </button>
                  </div>
                ))}
                <button type='button' className='pca-btn pca-btn-ghost' onClick={addFeatureRow} style={{ marginTop: 4 }}>
                  + Add feature
                </button>
              </div>

              <div className='pca-field'>
                <label className='pca-label'>Ideal For</label>
                <textarea
                  value={idealFor}
                  onChange={(e) => setIdealFor(e.target.value)}
                  rows={3}
                  className='pca-input'
                  placeholder='Great for daily commuters and travelers.'
                />
              </div>

              <div className='pca-field'>
                <label className='pca-label'>Why You&apos;ll Love It (one per line)</label>
                <p className='pca-hint'>Shown as short pills, e.g. &quot;Fits both cylinder sizes&quot;.</p>
                <textarea
                  value={loveItText}
                  onChange={(e) => setLoveItText(e.target.value)}
                  rows={3}
                  className='pca-input'
                  placeholder={'Fits both cylinder sizes\nBlocks wind, saves gas\n30-second setup'}
                />
              </div>

              <div className='pca-field'>
                <label className='pca-label'>Specifications</label>
                {specifications.map((row, index) => (
                  <div key={index} className='pca-feature-row'>
                    <input
                      type='text'
                      placeholder='Label (e.g. Material)'
                      value={row.label}
                      onChange={(e) => updateSpecRow(index, 'label', e.target.value)}
                      className='pca-input'
                      style={{ flex: 1 }}
                    />
                    <input
                      type='text'
                      placeholder='Value (e.g. Heat-resistant woven fabric)'
                      value={row.value}
                      onChange={(e) => updateSpecRow(index, 'value', e.target.value)}
                      className='pca-input'
                      style={{ flex: 2 }}
                    />
                    <button type='button' className='pca-btn pca-btn-ghost' onClick={() => removeSpecRow(index)}>
                      Remove
                    </button>
                  </div>
                ))}
                <button type='button' className='pca-btn pca-btn-ghost' onClick={addSpecRow} style={{ marginTop: 4 }}>
                  + Add specification
                </button>
              </div>

              <div className='pca-save-row'>
                <button type='submit' className='pca-btn pca-btn-primary' disabled={saveState.status === 'saving'}>
                  {saveState.status === 'saving' ? 'Saving…' : 'Save'}
                </button>
                {saveState.message ? (
                  <span className={saveState.status === 'error' ? 'pca-error' : 'pca-success'}>{saveState.message}</span>
                ) : null}
              </div>
            </form>
          )}
        </>
      )}
      <PcaStyles />
    </div>
  );
}

// Scoped styles for this internal-only page - kept separate from the site's
// global SCSS bundle on purpose (see HANDOVER.md's CSS-purge section: this
// page should never depend on or affect that bundle).
function PcaStyles() {
  return (
    <style jsx global>{`
      .pca-shell {
        max-width: 1040px;
        margin: 0 auto;
        padding: 32px 20px 80px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #1a1a1a;
      }
      .pca-center {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .pca-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 28px;
        flex-wrap: wrap;
      }
      .pca-title {
        font-size: 22px;
        font-weight: 700;
        margin: 0 0 4px;
      }
      .pca-subtitle {
        color: #666;
        margin: 0;
        max-width: 560px;
        font-size: 14px;
      }
      .pca-card {
        background: #fff;
        border: 1px solid #e4e4e7;
        border-radius: 12px;
        padding: 20px;
      }
      .pca-gate {
        width: 100%;
        max-width: 360px;
      }
      .pca-input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #d4d4d8;
        border-radius: 8px;
        font-size: 14px;
        box-sizing: border-box;
      }
      .pca-input:focus {
        outline: none;
        border-color: #dc2626;
        box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
      }
      .pca-label {
        display: block;
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 6px;
      }
      .pca-hint {
        margin: -2px 0 8px;
        font-size: 12px;
        color: #71717a;
      }
      .pca-field {
        margin-bottom: 20px;
      }
      .pca-btn {
        border-radius: 8px;
        padding: 9px 16px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid transparent;
        transition: opacity 0.15s ease;
      }
      .pca-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .pca-btn-primary {
        background: #dc2626;
        color: #fff;
      }
      .pca-btn-primary:hover:not(:disabled) {
        opacity: 0.9;
      }
      .pca-btn-ghost {
        background: #f4f4f5;
        color: #27272a;
        border-color: #e4e4e7;
      }
      .pca-btn-ghost:hover:not(:disabled) {
        background: #e4e4e7;
      }
      .pca-error {
        color: #dc2626;
        font-size: 13px;
        margin: 8px 0 0;
      }
      .pca-success {
        color: #16a34a;
        font-size: 13px;
      }
      .pca-muted {
        color: #71717a;
        font-size: 14px;
      }
      .pca-search-row {
        margin-bottom: 20px;
      }
      .pca-search-input {
        max-width: 360px;
      }
      .pca-back-link {
        background: none;
        border: none;
        color: #dc2626;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        padding: 0;
        margin-bottom: 16px;
      }
      .pca-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 14px;
        margin-bottom: 20px;
      }
      .pca-product-card {
        text-align: left;
        cursor: pointer;
        padding: 0;
        overflow: hidden;
        transition: box-shadow 0.15s ease, transform 0.15s ease;
      }
      .pca-product-card:hover {
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
        transform: translateY(-2px);
      }
      .pca-product-thumb {
        width: 100%;
        aspect-ratio: 1 / 1;
        background: #f4f4f5;
        overflow: hidden;
      }
      .pca-product-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .pca-thumb-placeholder {
        width: 100%;
        height: 100%;
      }
      .pca-product-info {
        padding: 10px 12px 12px;
      }
      .pca-product-name {
        font-size: 13px;
        font-weight: 600;
        margin: 0 0 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .pca-product-meta {
        font-size: 12px;
        color: #52525b;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .pca-badge {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .pca-badge-ok {
        background: #dcfce7;
        color: #16a34a;
      }
      .pca-badge-out {
        background: #fee2e2;
        color: #dc2626;
      }
      .pca-pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        margin-top: 12px;
      }
      .pca-selected-product {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 20px;
      }
      .pca-selected-thumb {
        width: 56px;
        height: 56px;
        object-fit: cover;
        border-radius: 8px;
        flex-shrink: 0;
      }
      .pca-feature-row {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
      }
      .pca-save-row {
        display: flex;
        align-items: center;
        gap: 14px;
      }
    `}</style>
  );
}

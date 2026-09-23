'use client';

import { useEffect, useState } from 'react';

// Shared shell for the internal /admin/* pages: a real login (username/email
// + password, checked against admin_users) plus the styles. One unified
// session grants access to every admin page - the old per-page
// `tokenStorageKey` prop is gone along with the two separate shared tokens
// it used to key. The session JWT is passed to children via the `token`
// render-prop so each page's own save calls can attach it as the
// x-admin-token header, exactly as before.
const SESSION_KEY = 'shopq_admin_session';

export default function AdminShell({ title, subtitle, children }) {
  const [token, setToken] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [gateReady, setGateReady] = useState(false);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(SESSION_KEY) : null;
    if (stored) setToken(stored);
    setGateReady(true);
  }, []);

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
      window.sessionStorage.setItem(SESSION_KEY, data.token);
      setToken(data.token);
      setPassword('');
    } catch (err) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = () => {
    window.sessionStorage.removeItem(SESSION_KEY);
    setToken('');
  };

  if (!gateReady) return null;

  if (!token) {
    return (
      <div className='adm-shell adm-center'>
        <form className='adm-card adm-gate' onSubmit={handleLogin}>
          <h1 className='adm-title'>{title}</h1>
          <p className='adm-subtitle'>Sign in to continue.</p>
          <div className='adm-field'>
            <label className='adm-label'>Username or email</label>
            <input type='text' autoComplete='username' value={identifier} onChange={(e) => setIdentifier(e.target.value)} className='adm-input' autoFocus />
          </div>
          <div className='adm-field' style={{ marginBottom: 8 }}>
            <label className='adm-label'>Password</label>
            <input type='password' autoComplete='current-password' value={password} onChange={(e) => setPassword(e.target.value)} className='adm-input' />
          </div>
          {loginError ? <p className='adm-error'>{loginError}</p> : null}
          <button type='submit' className='adm-btn adm-btn-primary' disabled={signingIn} style={{ width: '100%', marginTop: 12 }}>
            {signingIn ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <AdminStyles />
      </div>
    );
  }

  return (
    <div className='adm-shell'>
      <header className='adm-header'>
        <div>
          <h1 className='adm-title'>{title}</h1>
          {subtitle ? <p className='adm-subtitle'>{subtitle}</p> : null}
        </div>
        <button type='button' className='adm-btn adm-btn-ghost' onClick={signOut}>
          Sign out
        </button>
      </header>
      {typeof children === 'function' ? children(token) : children}
      <AdminStyles />
    </div>
  );
}

// Scoped styles, kept separate from the global SCSS bundle on purpose - see
// HANDOVER.md's CSS-purge section: internal-only admin tooling should never
// depend on or affect that bundle.
function AdminStyles() {
  return (
    <style jsx global>{`
      .adm-shell { max-width: 1040px; margin: 0 auto; padding: 32px 20px 80px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; }
      .adm-center { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
      .adm-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
      .adm-title { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
      .adm-subtitle { color: #666; margin: 0; max-width: 620px; font-size: 14px; }
      .adm-card { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 20px; }
      .adm-gate { width: 100%; max-width: 360px; }
      .adm-input { width: 100%; padding: 10px 12px; border: 1px solid #d4d4d8; border-radius: 8px; font-size: 14px; box-sizing: border-box; }
      .adm-input:focus { outline: none; border-color: #dc2626; box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1); }
      .adm-label { display: block; font-weight: 600; font-size: 14px; margin-bottom: 6px; }
      .adm-hint { margin: -2px 0 8px; font-size: 12px; color: #71717a; }
      .adm-field { margin-bottom: 20px; }
      .adm-btn { border-radius: 8px; padding: 9px 16px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: opacity 0.15s ease; }
      .adm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .adm-btn-primary { background: #dc2626; color: #fff; }
      .adm-btn-primary:hover:not(:disabled) { opacity: 0.9; }
      .adm-btn-ghost { background: #f4f4f5; color: #27272a; border-color: #e4e4e7; }
      .adm-btn-ghost:hover:not(:disabled) { background: #e4e4e7; }
      .adm-error { color: #dc2626; font-size: 13px; margin: 8px 0 0; }
      .adm-success { color: #16a34a; font-size: 13px; }
      .adm-muted { color: #71717a; font-size: 14px; }
      .adm-save-row { display: flex; align-items: center; gap: 14px; }
      .adm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .adm-table th { text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #71717a; border-bottom: 1px solid #e4e4e7; white-space: nowrap; }
      .adm-table td { padding: 10px; border-bottom: 1px solid #f0f0f2; vertical-align: top; }
      .adm-table tr:hover td { background: #fafafa; }
      .adm-flag { color: #dc2626; font-weight: 700; }
      .adm-pill { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
      .adm-pill-ok { background: #dcfce7; color: #16a34a; }
      .adm-pill-warn { background: #fef3c7; color: #a5680c; }
      .adm-pill-bad { background: #fee2e2; color: #dc2626; }
      .adm-filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; align-items: flex-end; }
      .adm-filters .adm-field { margin-bottom: 0; }
    `}</style>
  );
}

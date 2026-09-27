'use client';

import { useState } from 'react';
import { setSessionToken, clearSessionToken, useAdminSession } from '@/lib/adminSession';

// Shared shell for the internal /admin/* pages: a real login (username/email
// + password, checked against admin_users) plus the page header. One
// unified session grants access to every admin page, including
// product-content, which used to carry its own separate copy of this same
// gate. The session JWT is passed to children via the `token` render-prop so
// each page's own save calls can attach it as the x-admin-token header. The
// session itself lives in src/lib/adminSession.js so the sidebar layout can
// also know whether to show itself.
export default function AdminShell({ title, subtitle, children }) {
  const { token, ready: gateReady } = useAdminSession();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

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
      setSessionToken(data.token);
      setPassword('');
    } catch (err) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = () => {
    clearSessionToken();
  };

  if (!gateReady) return null;

  if (!token) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <form onSubmit={handleLogin} className="adm-card w-full max-w-sm">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">SQ</span>
            <div>
              <h1 className="text-base font-bold text-zinc-900">{title}</h1>
              <p className="text-xs text-zinc-500">Sign in to continue</p>
            </div>
          </div>
          <div className="adm-field">
            <label className="adm-label">Username or email</label>
            <input type="text" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="adm-input" autoFocus />
          </div>
          <div className="adm-field mb-2">
            <label className="adm-label">Password</label>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="adm-input" />
          </div>
          {loginError ? <p className="adm-error">{loginError}</p> : null}
          <button type="submit" className="adm-btn adm-btn-primary mt-3 w-full" disabled={signingIn}>
            {signingIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">{title}</h1>
          {subtitle ? <p className="mt-1 max-w-2xl text-sm text-zinc-500">{subtitle}</p> : null}
        </div>
        <button type="button" className="adm-btn adm-btn-ghost shrink-0" onClick={signOut}>
          Sign out
        </button>
      </header>
      {typeof children === 'function' ? children(token) : children}
    </div>
  );
}

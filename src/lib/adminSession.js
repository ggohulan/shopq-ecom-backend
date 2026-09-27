'use client';

import { useEffect, useState } from 'react';

// Thin wrapper around sessionStorage for the admin login token, so the
// sidebar layout (src/app/admin/layout.js) and the per-page login gate
// (AdminShell) can agree on whether the visitor is actually signed in - a
// plain sessionStorage.setItem doesn't notify other components in the same
// tab, so writes go through here and fire a custom event those components
// listen for.
const SESSION_KEY = 'shopq_admin_session';
const EVENT = 'shopq-admin-session-change';

export function getSessionToken() {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(SESSION_KEY) || '';
}

export function setSessionToken(token) {
  window.sessionStorage.setItem(SESSION_KEY, token);
  window.dispatchEvent(new Event(EVENT));
}

export function clearSessionToken() {
  window.sessionStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(EVENT));
}

// `ready` is false until the initial sessionStorage read completes, so
// callers can avoid a flash of the signed-out state on first render.
export function useAdminSession() {
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setToken(getSessionToken());
    setReady(true);
    const handler = () => setToken(getSessionToken());
    window.addEventListener(EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  return { token, ready };
}

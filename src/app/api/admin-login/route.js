// app/api/admin-login/route.js
//
// The only place a password is ever checked. Accepts a username OR email in
// `identifier` so the login form can be a single field. Always responds with
// the same generic error for "no such user" and "wrong password" - never
// reveal which one it was, that's a free username-enumeration oracle
// otherwise.
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDbPool } from '@/lib/db';
import { issueAdminSession } from '@/lib/adminAuth';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const identifier = String(body.identifier || '').trim();
  const password = String(body.password || '');
  if (!identifier || !password) {
    return NextResponse.json({ error: 'Username/email and password are required' }, { status: 400 });
  }

  try {
    const pool = getDbPool();
    const [rows] = await pool.query('SELECT id, username, password_hash FROM admin_users WHERE username = ? OR email = ? LIMIT 1', [
      identifier,
      identifier,
    ]);

    const user = rows[0];
    const matches = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !matches) {
      return NextResponse.json({ error: 'Incorrect username/email or password' }, { status: 401 });
    }

    const token = issueAdminSession(user);
    return NextResponse.json({ ok: true, token, username: user.username });
  } catch (err) {
    console.error('[admin-login] failed', err);
    return NextResponse.json({ error: 'Login failed - try again' }, { status: 500 });
  }
}

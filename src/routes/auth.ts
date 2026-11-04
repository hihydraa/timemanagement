import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { getDb } from '../db/client';
import { ApiError } from '../lib/http';
import { clearSessionCookie, setSessionCookie, signSession } from '../lib/session';
import { isEmailAllowed, upsertUser } from '../services/users';
import type { Env } from '../types';

const STATE_COOKIE = 'dobby_oauth_state';
const auth = new Hono<{ Bindings: Env }>();

const randomState = () => {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

auth.get('/google/login', (c) => {
  const state = randomState();
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: c.env.APP_BASE_URL.startsWith('https://'),
    sameSite: 'Lax',
    path: '/auth',
    maxAge: 600,
  });
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri', c.env.GOOGLE_REDIRECT_URI);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('prompt', 'select_account');
  return c.redirect(u.toString());
});

auth.get('/google/callback', async (c) => {
  const state = c.req.query('state');
  const code = c.req.query('code');
  const saved = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: '/auth' });
  if (!state || !saved || !code || !timingSafeEqual(state, saved)) {
    throw new ApiError(400, 'bad_state', 'การยืนยันตัวตนไม่ถูกต้อง กรุณาลองใหม่');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: c.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw new ApiError(400, 'oauth_failed', 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!infoRes.ok) throw new ApiError(400, 'oauth_failed', 'อ่านข้อมูลบัญชี Google ไม่ได้');
  const info = (await infoRes.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!info.email || !info.email_verified) {
    throw new ApiError(403, 'email_unverified', 'อีเมล Google ยังไม่ได้รับการยืนยัน');
  }
  if (!isEmailAllowed(c.env.ALLOWED_EMAILS ?? '', info.email)) {
    throw new ApiError(403, 'not_allowed', 'อีเมลนี้ไม่ได้รับอนุญาตให้ใช้งาน');
  }

  const userId = await upsertUser(getDb(c.env.DB), {
    email: info.email,
    name: info.name ?? '',
    googleSub: info.sub,
  });
  setSessionCookie(c, await signSession(c.env, userId));
  return c.redirect(c.env.APP_BASE_URL);
});

/** เฉพาะ local: DEV_LOGIN=1 ใน .dev.vars */
auth.get('/dev-login', async (c) => {
  if (c.env.DEV_LOGIN !== '1') throw new ApiError(404, 'not_found', 'ไม่พบเส้นทางนี้');
  const email = c.req.query('email') ?? '';
  if (!isEmailAllowed(c.env.ALLOWED_EMAILS ?? '', email)) {
    throw new ApiError(403, 'not_allowed', 'อีเมลนี้ไม่ได้รับอนุญาตให้ใช้งาน');
  }
  const userId = await upsertUser(getDb(c.env.DB), {
    email,
    name: email.split('@')[0] ?? email,
    googleSub: null,
  });
  setSessionCookie(c, await signSession(c.env, userId));
  return c.redirect(c.env.APP_BASE_URL);
});

auth.post('/logout', (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

export default auth;

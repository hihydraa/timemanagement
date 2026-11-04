import { SignJWT, jwtVerify } from 'jose';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../types';
import { now } from './time';

export const SESSION_COOKIE = 'dobby_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

const key = (env: Env) => new TextEncoder().encode(env.SESSION_SECRET);

export async function signSession(env: Env, userId: string): Promise<string> {
  const iat = Math.floor(now().getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + MAX_AGE_SEC)
    .sign(key(env));
}

export async function verifySession(env: Env, token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(env), {
      algorithms: ['HS256'],
      currentDate: now(),
    });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

const isHttps = (env: Env) => env.APP_BASE_URL.startsWith('https://');

export function setSessionCookie<E extends { Bindings: Env }>(c: Context<E>, token: string): void {
  // Secure เฉพาะเมื่อใช้ https (localhost dev เป็น http)
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(c.env),
    sameSite: 'Lax',
    path: '/',
    maxAge: MAX_AGE_SEC,
  });
}

export function clearSessionCookie<E extends { Bindings: Env }>(c: Context<E>): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

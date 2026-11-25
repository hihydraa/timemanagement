import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { ApiError } from '../lib/http';
import { MAX_AVATAR_PNG_BYTES, avatarKey, avatarSig, isPng, safeEqual } from '../lib/avatarImage';
import { rateLimit } from '../lib/rateLimit';
import type { AppEnv } from '../types';

/** อัปโหลดภาพตัวละคร PNG ของตัวเอง (ต้องล็อกอิน) — mount ใต้ /api */
export const avatarImageApi = new Hono<AppEnv>();
avatarImageApi.put(
  '/avatar2d/image',
  bodyLimit({
    maxSize: MAX_AVATAR_PNG_BYTES,
    onError: (c) =>
      c.json({ error: { code: 'request_too_large', message: 'ภาพต้องไม่เกิน 200 KB' } }, 413),
  }),
  rateLimit({ scope: 'avatarimg', limit: 30, windowSec: 600, key: (c) => c.get('userId') }),
  async (c) => {
    const buf = new Uint8Array(await c.req.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_AVATAR_PNG_BYTES)
      throw new ApiError(413, 'request_too_large', 'ภาพต้องไม่เกิน 200 KB');
    if (!isPng(buf)) throw new ApiError(400, 'validation_error', 'ต้องเป็นไฟล์ PNG');
    await c.env.FILES.put(avatarKey(c.get('userId')), buf, {
      httpMetadata: { contentType: 'image/png' },
    });
    return c.json({ ok: true });
  },
);

/** ลิงก์สาธารณะ /public/avatar/:userId/:sig.png (ให้ LINE ดึงภาพ) */
export const avatarImagePublic = new Hono<AppEnv>();
avatarImagePublic.get('/avatar/:userId/:file', async (c) => {
  const userId = c.req.param('userId');
  const sig = c.req.param('file').replace(/\.png$/, '');
  const ok = safeEqual(sig, await avatarSig(c.env.SESSION_SECRET, userId));
  const obj = ok ? await c.env.FILES.get(avatarKey(userId)) : null;
  if (!obj) return c.json({ error: { code: 'not_found', message: 'ไม่พบภาพ' } }, 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'image/png',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=300',
    },
  });
});

import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { getDb } from './db/client';
import { users } from './db/schema';
import { ApiError } from './lib/http';
import { readSessionCookie, verifySession } from './lib/session';
import type { AppEnv } from './types';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** ป้องกัน CSRF ชั้นที่สอง (นอกจาก SameSite=Lax): ถ้ามี Origin ต้องตรงกับแอปเรา */
export const originCheck: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (MUTATING.has(c.req.method)) {
    const origin = c.req.header('Origin');
    if (origin) {
      const allowed = new Set([new URL(c.req.url).origin, new URL(c.env.APP_BASE_URL).origin]);
      if (!allowed.has(origin)) throw new ApiError(403, 'bad_origin', 'Origin ไม่ได้รับอนุญาต');
    }
  }
  await next();
};

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = readSessionCookie(c);
  const userId = token ? await verifySession(c.env, token) : null;
  if (!userId) throw new ApiError(401, 'unauthorized', 'กรุณาเข้าสู่ระบบ');
  // session เป็น JWT อายุ 30 วัน: ต้องเช็คว่าผู้ใช้ยังมีอยู่ (บัญชีที่ถูกลบต้องใช้ cookie เก่าไม่ได้ ไม่งั้นจะเกิดข้อมูลกำพร้า)
  const exists = await getDb(c.env.DB)
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!exists) throw new ApiError(401, 'unauthorized', 'กรุณาเข้าสู่ระบบ');
  c.set('userId', userId);
  await next();
};

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import { users } from '../db/schema';
import { ApiError, parseJson } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { clearSessionCookie } from '../lib/session';
import { deleteAccount } from '../services/account';
import type { AppEnv } from '../types';

/** /api/account — อยู่หลัง auth + ตรวจ Origin (CSRF) */
const r = new Hono<AppEnv>();

const input = z.object({ confirm: z.string().trim().min(1).max(320) }).strict();

/** ลบบัญชีและข้อมูลทั้งหมด: ต้องพิมพ์อีเมลของบัญชียืนยัน (กันกดพลาด/กันคำขอที่ไม่ได้ตั้งใจ) */
r.delete(
  '/account',
  rateLimit({ scope: 'acctdel', limit: 5, windowSec: 3600, key: (c) => c.get('userId') }),
  async (c) => {
    const body = await parseJson(c, input);
    const db = getDb(c.env.DB);
    const userId = c.get('userId');
    const me = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (!me) throw new ApiError(401, 'unauthorized', 'กรุณาเข้าสู่ระบบ');
    if (body.confirm.toLowerCase() !== me.email.toLowerCase()) {
      throw new ApiError(400, 'confirm_mismatch', 'อีเมลที่พิมพ์ยืนยันไม่ตรงกับบัญชีนี้');
    }
    const res = await deleteAccount(c.env, db, userId);
    clearSessionCookie(c);
    return c.json({ ok: true, deletedFiles: res.files });
  },
);

export default r;

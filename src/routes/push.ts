import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import { pushSubscriptions } from '../db/schema';
import { ApiError, parseJson } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { nowIso } from '../lib/time';
import { b64uDecode, isAllowedPushEndpoint } from '../lib/webpush';
import { sendToUser, vapidFrom } from '../services/webNotifications';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
const MAX_DEVICES = 5;

const subInput = z
  .object({
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }).strict(),
  })
  .strict();

/** ฟีเจอร์พร้อมใช้ไหม (ตั้ง VAPID แล้ว) + กุญแจสาธารณะ + จำนวนอุปกรณ์ของผู้ใช้ */
r.get('/push/config', async (c) => {
  const db = getDb(c.env.DB);
  const v = vapidFrom(c.env);
  const n = await db
    .select({ n: sql<number>`count(*)` })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, c.get('userId')))
    .get();
  return c.json({ configured: !!v, publicKey: v?.publicKey ?? null, devices: Number(n?.n ?? 0) });
});

r.post('/push/subscribe', async (c) => {
  if (!vapidFrom(c.env))
    throw new ApiError(400, 'push_unavailable', 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่าแจ้งเตือนในเว็บ');
  const body = await parseJson(c, subInput);
  const key = b64uDecode(body.keys.p256dh);
  if (
    !isAllowedPushEndpoint(body.endpoint) ||
    key.length !== 65 ||
    b64uDecode(body.keys.auth).length !== 16
  )
    throw new ApiError(400, 'validation_error', 'ข้อมูลการสมัครรับแจ้งเตือนไม่ถูกต้อง');
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  const mine = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  // endpoint เดิม (เช่น สมัครซ้ำ) = อัปเดต; อุปกรณ์เกินเพดาน = ลบอันเก่าสุด
  const same = mine.find((s) => s.endpoint === body.endpoint);
  if (!same && mine.length >= MAX_DEVICES) {
    const oldest = [...mine].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]!;
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, oldest.id));
  }
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, body.endpoint)); // เปลี่ยนเจ้าของได้ (อุปกรณ์เดียวสลับบัญชี)
  await db.insert(pushSubscriptions).values({
    id: crypto.randomUUID(),
    userId,
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    createdAt: nowIso(),
  });
  return c.json({ ok: true });
});

r.delete('/push/subscribe', async (c) => {
  const body = await parseJson(c, z.object({ endpoint: z.string().max(1000) }).strict());
  await getDb(c.env.DB)
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, c.get('userId')),
        eq(pushSubscriptions.endpoint, body.endpoint),
      ),
    );
  return c.json({ ok: true });
});

/** ส่งข้อความทดสอบไปทุกอุปกรณ์ของตัวเอง */
r.post(
  '/push/test',
  rateLimit({ scope: 'pushtest', limit: 5, windowSec: 600, key: (c) => c.get('userId') }),
  async (c) => {
    const db = getDb(c.env.DB);
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, c.get('userId')));
    if (!subs.length) throw new ApiError(400, 'no_device', 'ยังไม่มีอุปกรณ์ที่เปิดแจ้งเตือน');
    const res = await sendToUser(c.env, db, subs, {
      title: 'Dobby',
      body: 'แจ้งเตือนในเว็บใช้งานได้แล้ว ✅',
      url: '/#/today',
      tag: 'dobby-test',
    });
    return c.json(res);
  },
);

export default r;

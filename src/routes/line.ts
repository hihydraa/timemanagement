import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import { lineLinkCodes, users } from '../db/schema';
import { ApiError } from '../lib/http';
import { now } from '../lib/time';
import { verifyLineSignature } from '../services/line';
import { processEvents, type LineEvent } from '../services/lineBot';
import type { AppEnv } from '../types';

const MAX_BODY = 1_000_000;

/** POST /webhook/line — ต้องผ่านการตรวจลายเซ็นก่อนทำอย่างอื่นทั้งหมด */
export const lineWebhook = new Hono<AppEnv>();

lineWebhook.post('/', async (c) => {
  if (Number(c.req.header('Content-Length') ?? 0) > MAX_BODY) {
    throw new ApiError(413, 'request_too_large', 'ขนาดคำขอใหญ่เกินกำหนด');
  }
  const raw = await c.req.arrayBuffer();
  if (raw.byteLength > MAX_BODY)
    throw new ApiError(413, 'request_too_large', 'ขนาดคำขอใหญ่เกินกำหนด');

  const ok = await verifyLineSignature(
    c.env.LINE_CHANNEL_SECRET,
    raw,
    c.req.header('x-line-signature'),
  );
  if (!ok) throw new ApiError(401, 'invalid_signature', 'ลายเซ็นไม่ถูกต้อง');

  let events: LineEvent[] = [];
  try {
    const body = JSON.parse(new TextDecoder().decode(raw)) as { events?: unknown };
    if (Array.isArray(body.events)) events = body.events as LineEvent[];
  } catch {
    throw new ApiError(400, 'invalid_json', 'รูปแบบ JSON ไม่ถูกต้อง');
  }

  // ตอบ 200 ทันที แล้วประมวลผลต่อเบื้องหลัง
  const work = processEvents(c.env, events);
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    await work; // ไม่มี ExecutionContext (เช่นใน test)
  }
  return c.json({ ok: true });
});

/** /api/line/* — จัดการการผูกบัญชีจากหน้าเว็บ (อยู่หลัง auth) */
export const lineApi = new Hono<AppEnv>();

const randomCode = (): string => {
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0]!;
  } while (n >= 4_294_000_000); // rejection sampling ให้กระจายสม่ำเสมอ
  return String(n % 1_000_000).padStart(6, '0');
};

lineApi.post('/link-code', async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  await db.delete(lineLinkCodes).where(eq(lineLinkCodes.userId, userId));
  const expiresAt = new Date(now().getTime() + 10 * 60_000).toISOString();
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    const ins = await db
      .insert(lineLinkCodes)
      .values({ code, userId, expiresAt })
      .onConflictDoNothing()
      .returning({ code: lineLinkCodes.code });
    if (ins.length) return c.json({ code, expiresAt });
  }
  throw new Error('could not allocate link code');
});

lineApi.get('/status', async (c) => {
  const u = await getDb(c.env.DB)
    .select({ lineUserId: users.lineUserId })
    .from(users)
    .where(eq(users.id, c.get('userId')))
    .get();
  return c.json({ linked: !!u?.lineUserId });
});

lineApi.delete('/link', async (c) => {
  await getDb(c.env.DB)
    .update(users)
    .set({ lineUserId: null })
    .where(eq(users.id, c.get('userId')));
  return c.json({ ok: true });
});

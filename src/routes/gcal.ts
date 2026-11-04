import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import { userSettings } from '../db/schema';
import { ApiError, parseJson } from '../lib/http';
import { disconnectGoogle, gcalStatus, resyncBatch } from '../services/googleCalendar';
import type { AppEnv } from '../types';

/** /api/gcal/* — อยู่หลัง auth + ตรวจ Origin (CSRF) */
const r = new Hono<AppEnv>();

r.get('/status', async (c) => c.json(await gcalStatus(c.env, getDb(c.env.DB), c.get('userId'))));

const settingsInput = z.object({
  syncEnabled: z.boolean().optional(),
  calendarId: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9._@#%+-]+$/, 'รหัสปฏิทินไม่ถูกต้อง')
    .optional(),
});

r.patch('/settings', async (c) => {
  const body = await parseJson(c, settingsInput);
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  const st = await gcalStatus(c.env, db, userId);
  if (body.syncEnabled && !st.connected) {
    throw new ApiError(400, 'not_connected', 'ยังไม่ได้เชื่อม Google Calendar');
  }
  const set: Partial<typeof userSettings.$inferInsert> = {};
  if (body.syncEnabled !== undefined) set.gcalSyncEnabled = body.syncEnabled ? 1 : 0;
  if (body.calendarId) set.gcalCalendarId = body.calendarId;
  if (Object.keys(set).length) {
    await db
      .insert(userSettings)
      .values({ userId, ...set })
      .onConflictDoUpdate({ target: userSettings.userId, set });
  }
  return c.json(await gcalStatus(c.env, db, userId));
});

r.post('/disconnect', async (c) => {
  const db = getDb(c.env.DB);
  await disconnectGoogle(c.env, db, c.get('userId'));
  return c.json(await gcalStatus(c.env, db, c.get('userId')));
});

const resyncInput = z.object({ cursor: z.string().max(64).nullable().optional() });

/** sync ใหม่ทีละชุด: เรียกซ้ำด้วย nextCursor จนกว่าจะเป็น null */
r.post('/resync', async (c) => {
  const body = await parseJson(c, resyncInput);
  const out = await resyncBatch(c.env, c.get('userId'), body.cursor ?? null);
  if (!out)
    throw new ApiError(
      400,
      'sync_unavailable',
      'ยังไม่ได้เชื่อม Google Calendar หรือปิดการซิงก์อยู่',
    );
  return c.json(out);
});

export default r;

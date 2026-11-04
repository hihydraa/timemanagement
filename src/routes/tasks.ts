import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import { background } from '../lib/background';
import { parseJson, parseQuery } from '../lib/http';
import { now } from '../lib/time';
import { removeEventSafe, syncTaskSafe } from '../services/googleCalendar';
import { ensureReal } from '../services/series';
import {
  createTask,
  deleteTask,
  getOwned,
  inboxTasks,
  listQuery,
  listTasks,
  openTasks,
  snoozeTask,
  taskInput,
  taskLimit,
  taskPatch,
  todayBuckets,
  updateTask,
  withTags,
} from '../services/tasks';
import { cockpit, rescheduleOverdue } from '../services/cockpit';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();

r.get('/tasks', async (c) => {
  const q = parseQuery(c, listQuery);
  return c.json({ tasks: await listTasks(getDb(c.env.DB), c.get('userId'), q) });
});

r.post('/tasks', async (c) => {
  const body = await parseJson(c, taskInput);
  const task = await createTask(getDb(c.env.DB), c.get('userId'), body, taskLimit(c.env));
  await background(c, syncTaskSafe(c.env, c.get('userId'), task.id));
  return c.json({ task }, 201);
});

r.get('/tasks/:id', async (c) => {
  const db = getDb(c.env.DB);
  const row = await getOwned(db, c.get('userId'), c.req.param('id'));
  return c.json({ task: (await withTags(db, [row]))[0] });
});

r.patch('/tasks/:id', async (c) => {
  const body = await parseJson(c, taskPatch);
  const task = await updateTask(getDb(c.env.DB), c.get('userId'), c.req.param('id'), body);
  await background(c, syncTaskSafe(c.env, c.get('userId'), task.id));
  return c.json({ task });
});

r.delete('/tasks/:id', async (c) => {
  const scope = c.req.query('scope') === 'series' ? 'series' : 'one';
  const userId = c.get('userId');
  const res = await deleteTask(getDb(c.env.DB), c.env.FILES, userId, c.req.param('id'), scope);
  // ลบทั้งซีรีส์/งานปกติ → ลบ event; ยกเลิกเฉพาะครั้งนี้ → ซิงก์แถวนั้น (event ของครั้งนั้นถูกลบ)
  await background(
    c,
    Promise.all([
      ...res.gcalEventIds.map((e) => removeEventSafe(c.env, userId, e)),
      res.tombstoneId ? syncTaskSafe(c.env, userId, res.tombstoneId) : Promise.resolve(),
    ]),
  );
  return c.json({ ok: true });
});

/** สร้างแถวจริงของ instance (ใช้ก่อนแนบไฟล์/แก้ checklist) — งานปกติคืนตัวเอง */
r.post('/tasks/:id/materialize', async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  const id = await ensureReal(db, userId, c.req.param('id'));
  return c.json({ task: (await withTags(db, [await getOwned(db, userId, id)]))[0] });
});

/** งานที่ยังไม่เสร็จทั้งหมด (สำหรับ Eisenhower Matrix) */
r.get('/matrix', async (c) => {
  const list = await openTasks(getDb(c.env.DB), c.get('userId'));
  return c.json({
    tasks: list.sort((a, b) => b.urgency * b.importance - a.urgency * a.importance),
  });
});

r.post('/tasks/:id/complete', async (c) => {
  const task = await updateTask(getDb(c.env.DB), c.get('userId'), c.req.param('id'), {
    status: 'done',
  });
  await background(c, syncTaskSafe(c.env, c.get('userId'), task.id));
  return c.json({ task });
});

const snoozeInput = z
  .object({
    minutes: z
      .number()
      .int()
      .min(1)
      .max(60 * 24 * 30)
      .optional(),
    days: z.number().int().min(1).max(365).optional(),
  })
  .refine((v) => v.minutes || v.days, 'ต้องระบุ minutes หรือ days');

r.post('/tasks/:id/snooze', async (c) => {
  const body = await parseJson(c, snoozeInput);
  const task = await snoozeTask(getDb(c.env.DB), c.get('userId'), c.req.param('id'), body);
  await background(c, syncTaskSafe(c.env, c.get('userId'), task.id));
  return c.json({ task });
});

r.get('/inbox', async (c) => c.json({ tasks: await inboxTasks(getDb(c.env.DB), c.get('userId')) }));

r.get('/today', async (c) => c.json(await todayBuckets(getDb(c.env.DB), c.get('userId'), now())));

/** ข้อมูลทั้งหมดของหน้า "วันนี้" ในคำขอเดียว */
r.get('/cockpit', async (c) => c.json(await cockpit(getDb(c.env.DB), c.get('userId'), now())));

const rescheduleInput = z.object({ to: z.enum(['today', 'tomorrow']) }).strict();

/** เลื่อนงานที่เลยกำหนดทั้งหมดไปวันนี้/พรุ่งนี้ (ครั้งละไม่เกิน 15 งาน; hasMore = ยังเหลือ) */
r.post('/today/reschedule-overdue', async (c) => {
  const body = await parseJson(c, rescheduleInput);
  const userId = c.get('userId');
  const res = await rescheduleOverdue(getDb(c.env.DB), userId, body.to, now());
  for (const id of res.movedIds) await background(c, syncTaskSafe(c.env, userId, id));
  return c.json(res);
});

export default r;

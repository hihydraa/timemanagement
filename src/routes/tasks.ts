import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import { ApiError, parseJson, parseQuery } from '../lib/http';
import { addDays, now } from '../lib/time';
import {
  createTask,
  deleteTask,
  getOwned,
  inboxTasks,
  listQuery,
  listTasks,
  taskInput,
  taskPatch,
  todayBuckets,
  updateTask,
  withTags,
} from '../services/tasks';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();

r.get('/tasks', async (c) => {
  const q = parseQuery(c, listQuery);
  return c.json({ tasks: await listTasks(getDb(c.env.DB), c.get('userId'), q) });
});

r.post('/tasks', async (c) => {
  const body = await parseJson(c, taskInput);
  return c.json({ task: await createTask(getDb(c.env.DB), c.get('userId'), body) }, 201);
});

r.get('/tasks/:id', async (c) => {
  const db = getDb(c.env.DB);
  const row = await getOwned(db, c.get('userId'), c.req.param('id'));
  return c.json({ task: (await withTags(db, [row]))[0] });
});

r.patch('/tasks/:id', async (c) => {
  const body = await parseJson(c, taskPatch);
  return c.json({
    task: await updateTask(getDb(c.env.DB), c.get('userId'), c.req.param('id'), body),
  });
});

r.delete('/tasks/:id', async (c) => {
  await deleteTask(getDb(c.env.DB), c.get('userId'), c.req.param('id'));
  return c.json({ ok: true });
});

r.post('/tasks/:id/complete', async (c) => {
  const task = await updateTask(getDb(c.env.DB), c.get('userId'), c.req.param('id'), {
    status: 'done',
  });
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
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  const t = await getOwned(db, userId, c.req.param('id'));
  const shiftMs = body.minutes ? body.minutes * 60_000 : body.days! * 86_400_000;
  const shift = (s: string | null) =>
    s ? new Date(new Date(s).getTime() + shiftMs).toISOString() : null;
  if (!t.startAt && !t.dueAt && !t.dueDate) {
    throw new ApiError(400, 'validation_error', 'งานนี้ยังไม่มีกำหนดเวลา');
  }
  const task = await updateTask(db, userId, t.id, {
    startAt: shift(t.startAt),
    endAt: shift(t.endAt),
    dueAt: shift(t.dueAt),
    dueDate: t.dueDate
      ? addDays(t.dueDate, body.days ?? Math.max(1, Math.round(shiftMs / 86_400_000)))
      : null,
    status: 'todo',
  });
  return c.json({ task });
});

r.get('/inbox', async (c) => c.json({ tasks: await inboxTasks(getDb(c.env.DB), c.get('userId')) }));

r.get('/today', async (c) => c.json(await todayBuckets(getDb(c.env.DB), c.get('userId'), now())));

export default r;

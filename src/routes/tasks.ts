import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import { parseJson, parseQuery } from '../lib/http';
import { now } from '../lib/time';
import {
  createTask,
  deleteTask,
  getOwned,
  inboxTasks,
  listQuery,
  listTasks,
  snoozeTask,
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
  await deleteTask(getDb(c.env.DB), c.env.FILES, c.get('userId'), c.req.param('id'));
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
  const task = await snoozeTask(getDb(c.env.DB), c.get('userId'), c.req.param('id'), body);
  return c.json({ task });
});

r.get('/inbox', async (c) => c.json({ tasks: await inboxTasks(getDb(c.env.DB), c.get('userId')) }));

r.get('/today', async (c) => c.json(await todayBuckets(getDb(c.env.DB), c.get('userId'), now())));

export default r;

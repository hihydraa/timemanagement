import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import { parseQuery } from '../lib/http';
import { overviewStats, weeklyStats } from '../services/stats';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();

const weekly = z.object({
  week: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'ต้องเป็นรูปแบบ YYYY-MM-DD')
    .optional(),
});
r.get('/stats/weekly', async (c) => {
  const q = parseQuery(c, weekly);
  return c.json(await weeklyStats(getDb(c.env.DB), c.get('userId'), q.week ?? null));
});

const overview = z.object({ days: z.coerce.number().int().min(7).max(90).default(30) });
r.get('/stats/overview', async (c) => {
  const q = parseQuery(c, overview);
  return c.json(await overviewStats(getDb(c.env.DB), c.get('userId'), q.days));
});

export default r;

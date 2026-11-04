import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import { categories, tasks } from '../db/schema';
import { ApiError, parseJson } from '../lib/http';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'สีต้องเป็นรูปแบบ #RRGGBB');
const input = z.object({
  name: z.string().trim().min(1).max(40),
  color,
  icon: z.string().max(8).nullable().default(null),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

async function owned(c: { env: AppEnv['Bindings']; get: (k: 'userId') => string }, id: string) {
  const row = await getDb(c.env.DB)
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, c.get('userId'))))
    .get();
  if (!row) throw new ApiError(404, 'not_found', 'ไม่พบประเภทงานนี้');
  return row;
}

r.get('/categories', async (c) => {
  const rows = await getDb(c.env.DB)
    .select()
    .from(categories)
    .where(eq(categories.userId, c.get('userId')))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return c.json({ categories: rows });
});

r.post('/categories', async (c) => {
  const body = await parseJson(c, input);
  const id = crypto.randomUUID();
  await getDb(c.env.DB)
    .insert(categories)
    .values({ id, userId: c.get('userId'), ...body });
  return c.json({ category: await owned(c, id) }, 201);
});

r.patch('/categories/:id', async (c) => {
  const id = c.req.param('id');
  await owned(c, id);
  const body = await parseJson(c, input.partial());
  if (Object.keys(body).length) {
    await getDb(c.env.DB)
      .update(categories)
      .set(body)
      .where(and(eq(categories.id, id), eq(categories.userId, c.get('userId'))));
  }
  return c.json({ category: await owned(c, id) });
});

r.delete('/categories/:id', async (c) => {
  const id = c.req.param('id');
  await owned(c, id);
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  await db
    .update(tasks)
    .set({ categoryId: null })
    .where(and(eq(tasks.categoryId, id), eq(tasks.userId, userId)));
  await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  return c.json({ ok: true });
});

export default r;

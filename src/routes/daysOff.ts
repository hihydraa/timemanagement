import { Hono } from 'hono';
import { getDb } from '../db/client';
import { parseJson, parseQuery } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { bangkokDate, now } from '../lib/time';
import {
  addDaysOff,
  addInput,
  deleteDayOff,
  listDaysOff,
  listQuery,
  patchDayOff,
  patchInput,
} from '../services/daysOff';
import type { AppEnv } from '../types';

/** วันหยุดงาน: บันทึกว่าหยุดวันไหนไปบ้าง (พักร้อน/ลาป่วย/ลากิจ/หยุดบริษัท/อื่น ๆ) */
const r = new Hono<AppEnv>();
const limit = rateLimit({
  scope: 'daysoff',
  limit: 120,
  windowSec: 600,
  key: (c) => c.get('userId'),
});

/** ไม่ส่งช่วง = ปีนี้ (เวลาไทย) */
r.get('/days-off', async (c) => {
  const q = parseQuery(c, listQuery);
  const year = bangkokDate(now()).slice(0, 4);
  return c.json(
    await listDaysOff(
      getDb(c.env.DB),
      c.get('userId'),
      q.from ?? `${year}-01-01`,
      q.to ?? `${year}-12-31`,
    ),
  );
});

r.post('/days-off', limit, async (c) => {
  const input = await parseJson(c, addInput);
  const db = getDb(c.env.DB);
  const out = await addDaysOff(db, c.get('userId'), input);
  const to = out.dates[out.dates.length - 1]!;
  const list = await listDaysOff(db, c.get('userId'), out.dates[0]!, to);
  return c.json({ created: out.created, updated: out.updated, ...list }, 201);
});

r.patch('/days-off/:id', limit, async (c) => {
  const patch = await parseJson(c, patchInput);
  return c.json({
    dayOff: await patchDayOff(getDb(c.env.DB), c.get('userId'), c.req.param('id'), patch),
  });
});

r.delete('/days-off/:id', limit, async (c) => {
  await deleteDayOff(getDb(c.env.DB), c.get('userId'), c.req.param('id'));
  return c.json({ ok: true });
});

export default r;

import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import { parseQuery } from '../lib/http';
import { bangkokDate, now } from '../lib/time';
import { gatherExport, toCsv, toIcs } from '../services/export';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
const query = z.object({ format: z.enum(['json', 'csv', 'ics']).default('json') });

/** ส่งออกข้อมูลของตัวเอง (JSON / CSV / ICS) */
r.get('/export', async (c) => {
  const { format } = parseQuery(c, query);
  const data = await gatherExport(getDb(c.env.DB), c.get('userId'));
  const stamp = bangkokDate(now());
  const type =
    format === 'json'
      ? 'application/json; charset=utf-8'
      : format === 'csv'
        ? 'text/csv; charset=utf-8'
        : 'text/calendar; charset=utf-8';
  const body =
    format === 'json'
      ? JSON.stringify(data, null, 2)
      : format === 'csv'
        ? toCsv(data)
        : toIcs(data, c.env.APP_BASE_URL);
  return new Response(body, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="dobby-${stamp}.${format}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

export default r;

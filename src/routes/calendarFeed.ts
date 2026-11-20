import { Hono } from 'hono';
import { getDb } from '../db/client';
import { rateLimit } from '../lib/rateLimit';
import { disableFeed, feedIcs, getFeed, rotateFeed } from '../services/calendarFeed';
import type { AppEnv } from '../types';

/** /api/calendar-feed — จัดการลิงก์สมัครรับปฏิทิน (หลัง auth + ตรวจ Origin) */
export const calendarFeedApi = new Hono<AppEnv>();

calendarFeedApi.get('/', async (c) =>
  c.json(await getFeed(getDb(c.env.DB), c.get('userId'), c.env.APP_BASE_URL)),
);
calendarFeedApi.post('/', async (c) =>
  c.json(await rotateFeed(getDb(c.env.DB), c.get('userId'), c.env.APP_BASE_URL)),
);
calendarFeedApi.delete('/', async (c) => {
  await disableFeed(getDb(c.env.DB), c.get('userId'));
  return c.json(await getFeed(getDb(c.env.DB), c.get('userId'), c.env.APP_BASE_URL));
});

/** GET /ics/<token>.ics — สาธารณะ (ความลับอยู่ที่ token): Apple Calendar ดึงซ้ำเป็นระยะ */
export const calendarFeedPublic = new Hono<AppEnv>();
calendarFeedPublic.get(
  '/:file',
  rateLimit({ scope: 'icsfeed', limit: 120, windowSec: 3600 }),
  async (c) => {
    const m = /^([a-f0-9]{48})\.ics$/.exec(c.req.param('file'));
    const ics = m ? await feedIcs(getDb(c.env.DB), m[1]!, c.env.APP_BASE_URL) : null;
    if (ics === null) return c.text('Not found', 404, { 'Cache-Control': 'no-store' });
    return new Response(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  },
);

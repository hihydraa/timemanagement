import { Hono } from 'hono';
import { getDb } from '../db/client';
import { parseJson } from '../lib/http';
import {
  alarmInput,
  alarmPatch,
  alarmToIcs,
  createAlarm,
  deleteAlarm,
  listAlarms,
  snoozeAlarm,
  stopAlarm,
  updateAlarm,
} from '../services/alarms';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();

r.get('/alarms', async (c) =>
  c.json({ alarms: await listAlarms(getDb(c.env.DB), c.get('userId')) }),
);

r.post('/alarms', async (c) => {
  const body = await parseJson(c, alarmInput);
  return c.json({ alarm: await createAlarm(getDb(c.env.DB), c.get('userId'), body) }, 201);
});

r.patch('/alarms/:id', async (c) => {
  const body = await parseJson(c, alarmPatch);
  return c.json({
    alarm: await updateAlarm(getDb(c.env.DB), c.get('userId'), c.req.param('id'), body),
  });
});

r.delete('/alarms/:id', async (c) => {
  await deleteAlarm(getDb(c.env.DB), c.get('userId'), c.req.param('id'));
  return c.json({ ok: true });
});

/** ปุ่ม "หยุด"/"เลื่อน 5 นาที" บนการแจ้งเตือน (เรียกจาก service worker) */
r.post('/alarms/:id/stop', async (c) => {
  await stopAlarm(getDb(c.env.DB), c.get('userId'), c.req.param('id'));
  return c.json({ ok: true });
});
r.post('/alarms/:id/snooze', async (c) => {
  await snoozeAlarm(getDb(c.env.DB), c.get('userId'), c.req.param('id'));
  return c.json({ ok: true });
});

/** ICS ของนาฬิกาปลุก เพื่อเพิ่มเข้าปฏิทินมือถือ (มี VALARM ตรงเวลา) */
r.get('/alarms/:id/ics', async (c) => {
  const db = getDb(c.env.DB);
  const a = (await listAlarms(db, c.get('userId'))).find((x) => x.id === c.req.param('id'));
  if (!a) return c.json({ error: { code: 'not_found', message: 'ไม่พบนาฬิกาปลุกนี้' } }, 404);
  return new Response(alarmToIcs(a), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="dobby-alarm.ics"',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
});

export default r;

import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import { focusSessions, tasks } from '../db/schema';
import { ApiError, parseJson, parseQuery } from '../lib/http';
import { addDays, bangkokDate, fromBangkok, now } from '../lib/time';
import { ensureReal } from '../services/series';
import { getOwned } from '../services/tasks';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();

const iso = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s).toISOString());
const sessionInput = z.object({
  taskId: z.string().nullable().optional(),
  startedAt: iso,
  endedAt: iso,
  minutes: z.number().int().min(1, 'ต้องอย่างน้อย 1 นาที').max(240, 'สูงสุด 240 นาทีต่อเซสชัน'),
});

/** บันทึกเซสชันโฟกัสที่จบแล้ว (จับเวลาฝั่งเว็บ ส่งมาตอนจบ) */
r.post('/focus-sessions', async (c) => {
  const body = await parseJson(c, sessionInput);
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  const start = Date.parse(body.startedAt);
  const end = Date.parse(body.endedAt);
  if (end < start)
    throw new ApiError(400, 'validation_error', 'endedAt: เวลาสิ้นสุดต้องไม่ก่อนเวลาเริ่ม');
  // กันข้อมูลมั่ว: จำนวนนาทีต้องไม่เกินช่วงเวลาจริง (เผื่อปัดขึ้น 1 นาที), ห้ามอนาคต/ย้อนหลังเกิน 3 วัน
  if (body.minutes > Math.ceil((end - start) / 60_000) + 1) {
    throw new ApiError(400, 'validation_error', 'minutes: มากกว่าช่วงเวลาที่เริ่ม–จบ');
  }
  const nowMs = now().getTime();
  if (end > nowMs + 5 * 60_000 || end < nowMs - 3 * 86_400_000) {
    throw new ApiError(
      400,
      'validation_error',
      'endedAt: ต้องอยู่ในช่วง 3 วันที่ผ่านมาถึงปัจจุบัน',
    );
  }
  let taskId: string | null = null;
  if (body.taskId) {
    await getOwned(db, userId, body.taskId); // ต้องเป็นงานของเรา
    taskId = await ensureReal(db, userId, body.taskId);
  }
  const row = {
    id: crypto.randomUUID(),
    userId,
    taskId,
    startedAt: body.startedAt,
    endedAt: body.endedAt,
    minutes: body.minutes,
  };
  await db.insert(focusSessions).values(row);
  return c.json({ session: row }, 201);
});

const listQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** เซสชันของวันหนึ่ง (ค่าเริ่มต้น = วันนี้) พร้อมชื่องานและยอดรวม */
r.get('/focus-sessions', async (c) => {
  const q = parseQuery(c, listQuery);
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  const date = q.date ?? bangkokDate(now());
  const rows = await db
    .select({
      id: focusSessions.id,
      taskId: focusSessions.taskId,
      startedAt: focusSessions.startedAt,
      endedAt: focusSessions.endedAt,
      minutes: focusSessions.minutes,
      title: tasks.title,
    })
    .from(focusSessions)
    .leftJoin(tasks, eq(tasks.id, focusSessions.taskId))
    .where(
      and(
        eq(focusSessions.userId, userId),
        gte(focusSessions.startedAt, fromBangkok(date).toISOString()),
        lt(focusSessions.startedAt, fromBangkok(addDays(date, 1)).toISOString()),
      ),
    )
    .orderBy(desc(focusSessions.startedAt))
    .limit(200);
  return c.json({ date, sessions: rows, totalMinutes: rows.reduce((n, s) => n + s.minutes, 0) });
});

export default r;

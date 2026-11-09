import { and, eq, gt, inArray, isNotNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { getDb } from '../db/client';
import { alarms, pushSubscriptions } from '../db/schema';
import { ApiError } from '../lib/http';
import { bangkokDate, bangkokHm, now, nowIso } from '../lib/time';
import type { Env } from '../types';
import { foldLine, icsText } from './export';
import { sendToUser, vapidFrom } from './webNotifications';

/**
 * นาฬิกาปลุก: Web Push เร่งด่วน (requireInteraction + สั่น) ตรงเวลา เช็คทุกนาทีจาก cron
 * ดังซ้ำทุก 1 นาที สูงสุด MAX_RINGS ครั้ง จนกดหยุด/เลื่อน (5 นาที) — ไม่ผูกกับ quiet hours (ผู้ใช้ตั้งเอง)
 * หมายเหตุ: เว็บสั่งนาฬิกาปลุกของระบบ (แอปนาฬิกา) ไม่ได้ จึงใช้การแจ้งเตือนเด้ง + ICS เข้าปฏิทินมือถือ
 */
export const MAX_RINGS = 4;
export const RING_GAP_MIN = 1;
export const SNOOZE_MIN = 5;
export const MAX_ALARMS_PER_USER = 20;
const MIN = 60_000;

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'เวลาต้องเป็นรูปแบบ HH:mm');
export const alarmInput = z
  .object({
    label: z.string().trim().max(80).default(''),
    time: hm,
    /** เลข ISO 1–7; ว่าง = ครั้งเดียว (วันนี้ถ้ายังไม่ถึงเวลา ไม่งั้นพรุ่งนี้) */
    days: z.array(z.number().int().min(1).max(7)).max(7).default([]),
    enabled: z.boolean().default(true),
  })
  .strict();
export const alarmPatch = alarmInput.partial().strict();

export interface AlarmDto {
  id: string;
  label: string;
  time: string;
  days: number[];
  onceDate: string | null;
  enabled: boolean;
  ringing: boolean;
}
type Row = typeof alarms.$inferSelect;

export const isoWeekday = (ymd: string): number => {
  const d = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};
const parseDays = (s: string): number[] =>
  s
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
const dto = (r: Row): AlarmDto => ({
  id: r.id,
  label: r.label,
  time: r.time,
  days: parseDays(r.days),
  onceDate: r.onceDate,
  enabled: r.enabled === 1,
  ringing: r.ringCount > 0,
});

/** ครั้งเดียว: ถ้าเวลานั้นผ่านไปแล้ววันนี้ → พรุ่งนี้ */
function nextOnceDate(time: string, at: Date): string {
  const today = bangkokDate(at);
  return time > bangkokHm(at) ? today : bangkokDate(new Date(at.getTime() + 24 * 3600_000));
}

export async function listAlarms(db: Db, userId: string): Promise<AlarmDto[]> {
  const rows = await db.select().from(alarms).where(eq(alarms.userId, userId));
  return rows.sort((a, b) => a.time.localeCompare(b.time)).map(dto);
}

async function owned(db: Db, userId: string, id: string): Promise<Row> {
  const r = await db
    .select()
    .from(alarms)
    .where(and(eq(alarms.id, id), eq(alarms.userId, userId)))
    .get();
  if (!r) throw new ApiError(404, 'not_found', 'ไม่พบนาฬิกาปลุกนี้');
  return r;
}

export async function createAlarm(
  db: Db,
  userId: string,
  input: z.infer<typeof alarmInput>,
  at = now(),
): Promise<AlarmDto> {
  const n = await db
    .select({ n: sql<number>`count(*)` })
    .from(alarms)
    .where(eq(alarms.userId, userId))
    .get();
  if (Number(n?.n ?? 0) >= MAX_ALARMS_PER_USER)
    throw new ApiError(409, 'alarm_limit', `ตั้งนาฬิกาปลุกได้สูงสุด ${MAX_ALARMS_PER_USER} ตัว`);
  const days = [...new Set(input.days)].sort();
  const row: Row = {
    id: crypto.randomUUID(),
    userId,
    label: input.label,
    time: input.time,
    days: days.join(','),
    onceDate: days.length ? null : nextOnceDate(input.time, at),
    enabled: input.enabled ? 1 : 0,
    lastFiredDate: null,
    ringCount: 0,
    nextRingAt: null,
    createdAt: nowIso(),
  };
  await db.insert(alarms).values(row);
  return dto(row);
}

export async function updateAlarm(
  db: Db,
  userId: string,
  id: string,
  p: z.infer<typeof alarmPatch>,
  at = now(),
): Promise<AlarmDto> {
  const cur = await owned(db, userId, id);
  const time = p.time ?? cur.time;
  const days = p.days !== undefined ? [...new Set(p.days)].sort() : parseDays(cur.days);
  // เปลี่ยนเวลา/วัน หรือเปิดใหม่ → คำนวณวันของ "ครั้งเดียว" ใหม่และเริ่มรอบใหม่; แก้แค่ชื่อ/ปิด = คงเดิม
  const retime = p.time !== undefined || p.days !== undefined || p.enabled === true;
  const set: Partial<Row> = {
    label: p.label ?? cur.label,
    time,
    days: days.join(','),
    onceDate: days.length
      ? null
      : retime
        ? nextOnceDate(time, at)
        : (cur.onceDate ?? nextOnceDate(time, at)),
    enabled: p.enabled !== undefined ? (p.enabled ? 1 : 0) : cur.enabled,
    ringCount: 0,
    nextRingAt: null,
    lastFiredDate: retime ? null : cur.lastFiredDate,
  };
  await db
    .update(alarms)
    .set(set)
    .where(and(eq(alarms.id, id), eq(alarms.userId, userId)));
  return dto(await owned(db, userId, id));
}

export async function deleteAlarm(db: Db, userId: string, id: string): Promise<void> {
  await owned(db, userId, id);
  await db.delete(alarms).where(and(eq(alarms.id, id), eq(alarms.userId, userId)));
}

/** หยุดเสียงรอบนี้ (ครั้งเดียว = ปิดนาฬิกานั้น) */
export async function stopAlarm(db: Db, userId: string, id: string): Promise<void> {
  const r = await owned(db, userId, id);
  await db
    .update(alarms)
    .set({ ringCount: 0, nextRingAt: null, ...(r.days === '' ? { enabled: 0 } : {}) })
    .where(and(eq(alarms.id, id), eq(alarms.userId, userId)));
}

/** เลื่อน 5 นาที: ดังอีกครั้งตอนครบเวลา (นับรอบใหม่) */
export async function snoozeAlarm(db: Db, userId: string, id: string, at = now()): Promise<void> {
  await owned(db, userId, id);
  await db
    .update(alarms)
    .set({ ringCount: 1, nextRingAt: new Date(at.getTime() + SNOOZE_MIN * MIN).toISOString() })
    .where(and(eq(alarms.id, id), eq(alarms.userId, userId)));
}

export interface AlarmRunSummary {
  fired: number;
  repeated: number;
  sent: number;
}
/** จำนวนคำขอ push ต่อรอบ (เพดาน subrequest ของ Worker ฟรี) */
const MAX_SENDS = 20;

/** เรียกทุกนาทีจาก cron: ดังตามเวลา + ดังซ้ำ/ที่เลื่อนไว้ */
export async function runAlarms(env: Env, at = now()): Promise<AlarmRunSummary> {
  const out: AlarmRunSummary = { fired: 0, repeated: 0, sent: 0 };
  if (!vapidFrom(env)) return out;
  const db = getDb(env.DB);
  const today = bangkokDate(at);
  const time = bangkokHm(at);
  const nowStr = at.toISOString();

  const rows = await db
    .select()
    .from(alarms)
    .where(
      or(
        and(eq(alarms.enabled, 1), eq(alarms.time, time)),
        and(gt(alarms.ringCount, 0), isNotNull(alarms.nextRingAt), lte(alarms.nextRingAt, nowStr)),
      ),
    )
    .limit(200);
  if (!rows.length) return out;

  const due: { r: Row; first: boolean }[] = [];
  for (const r of rows) {
    if (r.ringCount > 0) {
      if (r.nextRingAt && r.nextRingAt <= nowStr) due.push({ r, first: false });
    } else if (r.enabled === 1 && r.time === time && r.lastFiredDate !== today) {
      const hit =
        r.days === '' ? r.onceDate === today : parseDays(r.days).includes(isoWeekday(today));
      if (hit) due.push({ r, first: true });
    }
  }
  if (!due.length) return out;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, [...new Set(due.map((d) => d.r.userId))]));
  let budget = MAX_SENDS;
  for (const { r, first } of due) {
    const mine = subs.filter((s) => s.userId === r.userId);
    const count = r.ringCount + 1;
    const finished = !first && r.ringCount >= MAX_RINGS;
    if (finished) {
      // ดังครบแล้วไม่มีใครกด: เงียบ (ครั้งเดียว = ปิดนาฬิกา)
      await db
        .update(alarms)
        .set({ ringCount: 0, nextRingAt: null, ...(r.days === '' ? { enabled: 0 } : {}) })
        .where(eq(alarms.id, r.id));
      continue;
    }
    if (first) out.fired++;
    else out.repeated++;
    if (mine.length && budget >= mine.length) {
      budget -= mine.length;
      const res = await sendToUser(
        env,
        db,
        mine,
        {
          title: `⏰ ${r.label || 'นาฬิกาปลุก'}`,
          body: first ? `ถึงเวลา ${r.time} น.` : `ถึงเวลา ${r.time} น. (ดังซ้ำ ${count - 1})`,
          url: '/#/today',
          tag: `alarm-${r.id}`,
          alarmId: r.id,
        },
        undefined,
        { urgency: 'high', ttl: 120 },
      );
      out.sent += res.ok;
    }
    await db
      .update(alarms)
      .set({
        ringCount: count,
        nextRingAt: new Date(at.getTime() + RING_GAP_MIN * MIN).toISOString(),
        ...(first ? { lastFiredDate: today } : {}),
      })
      .where(eq(alarms.id, r.id));
  }
  return out;
}

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
/** ICS ของนาฬิกาปลุก: เปิดในมือถือเพื่อเพิ่มเข้าแอปปฏิทิน — มี VALARM (แจ้งเตือน+เสียง) ตรงเวลา ไม่ต้องพึ่งเว็บ */
export function alarmToIcs(a: AlarmDto, at = now()): string {
  const [h, m] = a.time.split(':');
  const start = (a.onceDate ?? bangkokDate(at)).replace(/-/g, '');
  const name = `⏰ ${a.label || 'นาฬิกาปลุก'}`;
  const L = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dobby//Alarm//TH',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:alarm-${a.id}@dobby`,
    `DTSTAMP:${at.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART;TZID=Asia/Bangkok:${start}T${h}${m}00`,
    'DURATION:PT5M',
    ...(a.days.length
      ? [`RRULE:FREQ=WEEKLY;BYDAY=${a.days.map((d) => BYDAY[d - 1]).join(',')}`]
      : []),
    `SUMMARY:${icsText(name)}`,
    'BEGIN:VALARM',
    'ACTION:AUDIO',
    'TRIGGER:PT0S',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(name)}`,
    'TRIGGER:PT0S',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${L.map(foldLine).join('\r\n')}\r\n`;
}

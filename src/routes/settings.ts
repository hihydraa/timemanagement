import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import { userSettings, users } from '../db/schema';
import { ApiError, parseJson } from '../lib/http';
import { parseWorkDays } from '../lib/work';
import { clearUsage, CLIENT_EVENTS, track, type EventName } from '../services/analytics';
import { nowIso } from '../lib/time';
import { notificationStatus } from '../services/notifications';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();

/** ส่วนของแถบด้านข้างที่ผู้ใช้เลือกแสดง/ซ่อนได้ (ลำดับแสดงคงที่ตามนี้) */
export const SIDEBAR_SECTIONS = [
  'mini',
  'search',
  'category',
  'urgency',
  'importance',
  'status',
  'tag',
  'legend',
] as const;
export const DEFAULT_SIDEBAR: string[] = ['mini', 'search', 'category', 'urgency'];

function parseSidebar(raw: string | null | undefined): string[] {
  if (!raw) return DEFAULT_SIDEBAR;
  try {
    const v: unknown = JSON.parse(raw);
    if (Array.isArray(v)) {
      const ok = SIDEBAR_SECTIONS.filter((s) => v.includes(s));
      return ok;
    }
  } catch {
    /* ใช้ค่าเริ่มต้น */
  }
  return DEFAULT_SIDEBAR;
}

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'เวลาต้องเป็นรูปแบบ HH:mm');
const patchInput = z
  .object({
    morningDigestTime: hm,
    eveningReviewTime: hm,
    eveningReviewEnabled: z.boolean(),
    deadlineAlertTime: hm,
    remindBeforeMinutes: z.number().int().min(0, 'ต้องไม่ติดลบ').max(1440, 'สูงสุด 1440 นาที'),
    quietHoursStart: hm,
    quietHoursEnd: hm,
    lineNotifyEnabled: z.boolean(),
    sidebarSections: z.array(z.enum(SIDEBAR_SECTIONS)).max(SIDEBAR_SECTIONS.length),
    workStart: hm,
    workEnd: hm,
    uiMode: z.enum(['simple', 'full']),
    analyticsOptOut: z.boolean(),
    /** true = ทำ/ข้าม onboarding แล้ว, false = เปิดให้ทำใหม่ */
    onboardingDone: z.boolean(),
    workDays: z.array(z.number().int().min(1).max(7)).min(1, 'เลือกวันทำงานอย่างน้อย 1 วัน').max(7),
  })
  .partial()
  .strict();

async function view(db: ReturnType<typeof getDb>, userId: string) {
  const [s, u] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).get(),
    db.select({ lineUserId: users.lineUserId }).from(users).where(eq(users.id, userId)).get(),
  ]);
  const d = s ?? ({} as Partial<typeof userSettings.$inferSelect>);
  return {
    settings: {
      morningDigestTime: d.morningDigestTime ?? '07:30',
      eveningReviewTime: d.eveningReviewTime ?? '20:00',
      eveningReviewEnabled: (d.eveningReviewEnabled ?? 0) === 1,
      deadlineAlertTime: d.deadlineAlertTime ?? '15:00',
      remindBeforeMinutes: d.remindBeforeMinutes ?? 30,
      quietHoursStart: d.quietHoursStart ?? '22:00',
      quietHoursEnd: d.quietHoursEnd ?? '06:30',
      lineNotifyEnabled: (d.lineNotifyEnabled ?? 1) === 1,
    },
    /** แยกจาก settings (การแจ้งเตือน) เพื่อไม่ให้หน้าตั้งค่าแจ้งเตือนเขียนทับโดยไม่ตั้งใจ */
    sidebarSections: parseSidebar(d.sidebarSections),
    work: {
      start: d.workStart ?? '09:00',
      end: d.workEnd ?? '18:00',
      days: parseWorkDays(d.workDays),
    },
    uiMode: d.uiMode === 'full' ? 'full' : 'simple',
    analyticsOptOut: (d.analyticsOptOut ?? 0) === 1,
    onboardingDone: !!d.onboardingDoneAt,
    lineLinked: !!u?.lineUserId,
  };
}

r.get('/settings', async (c) => c.json(await view(getDb(c.env.DB), c.get('userId'))));

r.patch('/settings', async (c) => {
  const body = await parseJson(c, patchInput);
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  const set: Partial<typeof userSettings.$inferInsert> = {};
  if (body.morningDigestTime !== undefined) set.morningDigestTime = body.morningDigestTime;
  if (body.eveningReviewTime !== undefined) set.eveningReviewTime = body.eveningReviewTime;
  if (body.eveningReviewEnabled !== undefined)
    set.eveningReviewEnabled = body.eveningReviewEnabled ? 1 : 0;
  if (body.deadlineAlertTime !== undefined) set.deadlineAlertTime = body.deadlineAlertTime;
  if (body.remindBeforeMinutes !== undefined) set.remindBeforeMinutes = body.remindBeforeMinutes;
  if (body.quietHoursStart !== undefined) set.quietHoursStart = body.quietHoursStart;
  if (body.quietHoursEnd !== undefined) set.quietHoursEnd = body.quietHoursEnd;
  if (body.lineNotifyEnabled !== undefined) set.lineNotifyEnabled = body.lineNotifyEnabled ? 1 : 0;
  if (body.workStart !== undefined || body.workEnd !== undefined) {
    const cur = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
    const start = body.workStart ?? cur?.workStart ?? '09:00';
    const end = body.workEnd ?? cur?.workEnd ?? '18:00';
    if (end <= start)
      throw new ApiError(400, 'validation_error', 'workEnd: เวลาเลิกงานต้องหลังเวลาเริ่มงาน');
    if (body.workStart !== undefined) set.workStart = body.workStart;
    if (body.workEnd !== undefined) set.workEnd = body.workEnd;
  }
  if (body.workDays !== undefined) set.workDays = [...new Set(body.workDays)].sort().join(',');
  if (body.sidebarSections !== undefined)
    set.sidebarSections = JSON.stringify([...new Set(body.sidebarSections)]);
  if (body.uiMode !== undefined) set.uiMode = body.uiMode;
  if (body.analyticsOptOut !== undefined) set.analyticsOptOut = body.analyticsOptOut ? 1 : 0;
  if (body.onboardingDone !== undefined)
    set.onboardingDoneAt = body.onboardingDone ? nowIso() : null;
  const prevMode =
    body.uiMode !== undefined
      ? (await db.select().from(userSettings).where(eq(userSettings.userId, userId)).get())?.uiMode
      : undefined;
  if (Object.keys(set).length) {
    await db
      .insert(userSettings)
      .values({ userId, ...set })
      .onConflictDoUpdate({ target: userSettings.userId, set });
  }
  if (body.analyticsOptOut === true) await clearUsage(db, userId); // opt-out = ลบที่เคยเก็บไว้ด้วย
  if (body.uiMode !== undefined && body.uiMode !== (prevMode ?? 'simple'))
    await track(db, userId, 'ui_mode_changed', { to: body.uiMode });
  return c.json(await view(db, userId));
});

/** เหตุการณ์ที่เกิดฝั่งหน้าเว็บ (ชื่อเหตุการณ์ที่อนุญาตเท่านั้น, ไม่รับ props จากผู้ใช้) */
r.post('/events', async (c) => {
  const body = await parseJson(
    c,
    z.object({ name: z.enum(CLIENT_EVENTS as [string, ...string[]]) }).strict(),
  );
  await track(getDb(c.env.DB), c.get('userId'), body.name as EventName);
  return c.json({ ok: true });
});

/** โควตา push ของเดือนนี้ (ใช้เตือนในเว็บเมื่อใกล้เต็ม) */
r.get('/notifications/status', async (c) =>
  c.json(await notificationStatus(c.env, getDb(c.env.DB))),
);

export default r;

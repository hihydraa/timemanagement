import { and, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { getDb } from '../db/client';
import { notificationLog, pushSubscriptions, reminders, tasks, userSettings } from '../db/schema';
import { bangkokDate, bangkokHm, fromBangkok, now, nowIso } from '../lib/time';
import { sendWebPush, type VapidKeys } from '../lib/webpush';
import type { Env } from '../types';
import {
  inWindow,
  isQuietHours,
  reminderCandidates,
  workDay,
  type Settings,
  type Target,
} from './notifications';
import { isVirtualId } from './series';
import { todayBuckets } from './tasks';

/**
 * แจ้งเตือนในเว็บ (Web Push) — ไม่กินโควตา LINE
 * ส่งชุดเดียวกับ LINE แต่ข้อความสั้น: สรุปเช้า, เตือนก่อนนัดที่กำหนดเวลา, สรุปเย็น (ถ้าเปิด)
 * บันทึกลง notification_log (channel = web_push) และกันซ้ำรายวันเหมือน LINE; เคารพ quiet hours
 */
export const CHANNEL = 'web_push';
/** จำนวนคำขอ push ต่อรอบ cron (เพดาน subrequest ของ Worker ฟรี) */
export const MAX_WEB_SENDS_PER_RUN = 15;
const MIN = 60_000;

export const vapidFrom = (env: Env): VapidKeys | null =>
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
    ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
    : null;
export const vapidSubject = (env: Env): string =>
  env.CONTACT_EMAIL ? `mailto:${env.CONTACT_EMAIL}` : env.APP_BASE_URL;

export interface WebMessage {
  title: string;
  body: string;
  /** เส้นทางที่เปิดเมื่อกดแจ้งเตือน */
  url: string;
  /** แจ้งเตือนชนิดเดียวกันแทนที่กัน ไม่ซ้อนกัน */
  tag: string;
  /** นาฬิกาปลุก: ให้ service worker แสดงแบบเร่งด่วน + ปุ่มหยุด/เลื่อน */
  alarmId?: string;
}

type Sub = typeof pushSubscriptions.$inferSelect;

/** ส่งให้ทุกอุปกรณ์ของผู้ใช้; ลบ subscription ที่ push service บอกว่าใช้ไม่ได้แล้ว. คืนจำนวนที่สำเร็จ + จำนวนคำขอ */
export async function sendToUser(
  env: Env,
  db: Db,
  subs: Sub[],
  msg: WebMessage,
  fetchFn?: typeof fetch,
  opts: { urgency?: 'normal' | 'high'; ttl?: number } = {},
): Promise<{ ok: number; tried: number }> {
  const vapid = vapidFrom(env);
  if (!vapid) return { ok: 0, tried: 0 };
  let ok = 0;
  const gone: string[] = [];
  for (const s of subs) {
    const r = await sendWebPush(s, msg, vapid, vapidSubject(env), { fetchFn, ...opts });
    if (r.ok) ok++;
    else if (r.gone) gone.push(s.id);
  }
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  return { ok, tried: subs.length };
}

async function log(db: Db, userId: string, kind: string, ok: boolean, detail: string) {
  await db.insert(notificationLog).values({
    id: crypto.randomUUID(),
    userId,
    channel: CHANNEL,
    kind,
    sentAt: nowIso(),
    ok: ok ? 1 : 0,
    detail,
  });
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface WebRunSummary {
  users: number;
  sent: number;
  failed: number;
}

export async function runWebNotifications(env: Env): Promise<WebRunSummary> {
  const out: WebRunSummary = { users: 0, sent: 0, failed: 0 };
  if (!vapidFrom(env)) return out;
  const db = getDb(env.DB);
  const at = now();
  const today = bangkokDate(at);
  const hm = bangkokHm(at);

  const subs = await db.select().from(pushSubscriptions);
  if (!subs.length) return out; // รอบส่วนใหญ่จบที่นี่ (query เดียว)
  const byUser = new Map<string, Sub[]>();
  for (const s of subs) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);
  const settings = await db
    .select()
    .from(userSettings)
    .where(inArray(userSettings.userId, [...byUser.keys()]));
  const active: Target[] = settings
    .filter((s) => !isQuietHours(hm, s.quietHoursStart, s.quietHoursEnd))
    .map((s) => ({ userId: s.userId, lineUserId: '', s }));
  out.users = byUser.size;
  if (!active.length) return out;

  const dayStart = fromBangkok(today).toISOString();
  const logs = await db
    .select({ userId: notificationLog.userId, kind: notificationLog.kind, ok: notificationLog.ok })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.channel, CHANNEL),
        gte(notificationLog.sentAt, dayStart),
        inArray(
          notificationLog.userId,
          active.map((t) => t.userId),
        ),
      ),
    );
  const done = new Set(logs.filter((l) => l.ok === 1).map((l) => `${l.userId}|${l.kind}`));
  const failures = new Map<string, number>();
  for (const l of logs.filter((x) => x.ok === 0))
    failures.set(`${l.userId}|${l.kind}`, (failures.get(`${l.userId}|${l.kind}`) ?? 0) + 1);

  let budget = MAX_WEB_SENDS_PER_RUN;
  const send = async (t: Target, kind: string, msg: WebMessage, detail: string) => {
    const mine = byUser.get(t.userId) ?? [];
    if (!mine.length || budget < mine.length) return false;
    budget -= mine.length;
    const r = await sendToUser(env, db, mine, msg);
    await log(db, t.userId, kind, r.ok > 0, `${detail};devices=${r.ok}/${r.tried}`);
    if (r.ok > 0) out.sent++;
    else out.failed++;
    return r.ok > 0;
  };

  // --- เตือนก่อนนัด (เฉพาะงานที่กำหนดเวลาเริ่ม) ---
  const { events, virtualRows } = await reminderCandidates(db, active, at);
  if (events.length) {
    const keys = [...new Set(events.map((e) => e.key))];
    const sentKeys = new Set<string>();
    for (let i = 0; i < keys.length; i += 50) {
      const rows = await db
        .select()
        .from(reminders)
        .where(
          and(
            inArray(reminders.taskId, keys.slice(i, i + 50)),
            eq(reminders.kind, 'web_before'),
            isNotNull(reminders.sentAt),
          ),
        );
      for (const r of rows) sentKeys.add(`${r.taskId}|${r.remindAt}`);
    }
    const fresh = events.filter((e) => !sentKeys.has(`${e.key}|${e.at}`));
    const realIds = [...new Set(fresh.map((e) => e.taskId).filter((id) => !isVirtualId(id)))].slice(
      0,
      50,
    );
    const rows = realIds.length
      ? await db.select().from(tasks).where(inArray(tasks.id, realIds))
      : [];
    const titles = new Map([...rows, ...virtualRows].map((r) => [r.id, r.title]));
    for (const t of active) {
      const mine = fresh
        .filter((e) => e.userId === t.userId)
        .sort((a, b) => a.at.localeCompare(b.at));
      if (!mine.length || (failures.get(`${t.userId}|reminder`) ?? 0) >= 3) continue;
      const first = mine[0]!;
      const mins = Math.max(1, Math.ceil((Date.parse(first.at) - at.getTime()) / MIN));
      const name = clip(titles.get(first.taskId) ?? 'งาน', 60);
      const msg: WebMessage = {
        title: mine.length > 1 ? `⏰ อีก ${mins} นาที: ${mine.length} งาน` : `⏰ อีก ${mins} นาที`,
        body: mine.length > 1 ? `${name} และอีก ${mine.length - 1} งาน` : name,
        url: '/#/today',
        tag: 'dobby-reminder',
      };
      if (await send(t, 'reminder', msg, `n=${mine.length}`))
        await db.insert(reminders).values(
          mine.map((e) => ({
            id: crypto.randomUUID(),
            taskId: e.key,
            remindAt: e.at,
            sentAt: nowIso(),
            kind: 'web_before' as const,
          })),
        );
    }
  }

  // --- สรุปเช้า / สรุปเย็น ---
  const due = (s: Settings, kind: 'morning_digest' | 'evening_review') =>
    kind === 'morning_digest'
      ? inWindow(hm, s.morningDigestTime)
      : s.eveningReviewEnabled === 1 && inWindow(hm, s.eveningReviewTime);
  for (const t of active) {
    for (const kind of ['morning_digest', 'evening_review'] as const) {
      const key = `${t.userId}|${kind}`;
      if (!due(t.s, kind) || done.has(key) || (failures.get(key) ?? 0) >= 3 || budget <= 0)
        continue;
      const b = await todayBuckets(db, t.userId, at);
      if (kind === 'morning_digest') {
        const planned = b.dueToday.length + b.today.length;
        const timed = [...b.dueToday, ...b.today].some((x) => !x.allDay && !!x.startAt);
        if (!planned || (!workDay(t.s, today) && !timed)) continue; // ไม่มีงาน = ไม่ส่ง
        const top = [...b.dueToday, ...b.today][0]!;
        await send(
          t,
          kind,
          {
            title: `🌅 วันนี้ ${planned} งาน`,
            body:
              clip(top.title, 60) +
              (b.dueToday.length ? ` · เดดไลน์วันนี้ ${b.dueToday.length}` : '') +
              (b.overdue.length ? ` · ค้างอยู่ ${b.overdue.length}` : ''),
            url: '/#/today',
            tag: 'dobby-morning',
          },
          `n=${planned};overdue=${b.overdue.length}`,
        );
      } else {
        const end = fromBangkok(today).getTime() + 24 * 60 * MIN;
        const doneRows = await db
          .select({ n: sql<number>`count(*)` })
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, t.userId),
              eq(tasks.status, 'done'),
              gte(tasks.completedAt, dayStart),
              lt(tasks.completedAt, new Date(end).toISOString()),
            ),
          )
          .get();
        const finished = Number(doneRows?.n ?? 0);
        const pending = [...b.overdue, ...b.dueToday, ...b.today].filter(
          (x) => (x.dueDate ?? x.dueAt ?? x.startAt ?? '').slice(0, 10) === today || !!x.startAt,
        ).length;
        if (!finished && !pending) continue;
        await send(
          t,
          kind,
          {
            title: '🌙 สรุปวันนี้',
            body: `เสร็จแล้ว ${finished} งาน · ยังค้าง ${pending} งาน`,
            url: '/#/today',
            tag: 'dobby-evening',
          },
          `done=${finished};pending=${pending}`,
        );
      }
    }
  }
  return out;
}

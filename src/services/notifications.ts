import { and, eq, gt, gte, inArray, isNotNull, lt, lte, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { getDb } from '../db/client';
import { notificationLog, reminders, tasks, userSettings, users } from '../db/schema';
import { bangkokDate, bangkokHm, fromBangkok, now, nowIso } from '../lib/time';
import type { Env } from '../types';
import {
  alertCarousel,
  dayLabel,
  eveningCard,
  listCard,
  taskDate,
  type AlertItem,
  type ListSection,
} from './flex';
import { pushMessage, type LineMessage } from './line';
import { setList } from './lineBot';
import { todayBuckets, withTags, type TaskDto } from './tasks';

/**
 * แจ้งเตือนผ่าน LINE push (เรียกจาก cron ทุก 5 นาที)
 *
 * หลักการ:
 * - "หน้าต่างเวลา": ส่งได้ตั้งแต่เวลาที่ผู้ใช้ตั้งไปอีก WINDOW_MIN นาที (ไม่ต้องตรงนาที) และส่งวันละครั้ง (เช็คจาก notification_log)
 *   จึงทนต่อ cron ที่ช้า/ข้ามรอบ และเลื่อนงานไปรอบถัดไปได้เมื่อชนเพดานของ Worker ฟรี
 * - 1 push = 1 message object (Flex) เพื่อนับโควตาเพียง 1 และรวมหลายงานในข้อความเดียว
 * - เคารพ quiet hours, line_notify_enabled และโควตา PUSH_MONTHLY_LIMIT (นับรวมทั้ง OA)
 */

export const WINDOW_MIN = 120;
/** Worker ฟรีทำ D1 query/subrequest ได้ ~50 ครั้งต่อ invocation: จำกัด push ต่อรอบ ที่เหลือรอรอบถัดไป */
export const MAX_PUSHES_PER_RUN = 5;
const MAX_ATTEMPTS_PER_KIND_PER_DAY = 3;
const MAX_FAILURES_PER_USER_PER_DAY = 5;
const HORIZON_MIN = 1440;
const MIN = 60_000;
const OPEN = ['todo', 'doing'] as const;

/** หน่วงก่อน retry (มิลลิวินาที) — export ให้ test ตั้งเป็น 0 ได้ */
export const retryDelays = { ms: [300, 1000] };
const sleep = (ms: number) =>
  ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();

type Settings = typeof userSettings.$inferSelect;
type Kind = 'morning_digest' | 'deadline_alert' | 'evening_review' | 'reminder';
const DAILY: Kind[] = ['deadline_alert', 'morning_digest', 'evening_review']; // ลำดับความสำคัญเมื่อชนเพดาน
const QUOTA_HIT = 'push_quota_hit';

interface Target {
  userId: string;
  lineUserId: string;
  s: Settings;
}

// ---------------------------------------------------------------- time helpers
export const toMin = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

/** quiet hours ข้ามเที่ยงคืนได้ (เช่น 22:00–06:30); start == end = ไม่มี quiet hours */
export function isQuietHours(hm: string, start: string, end: string): boolean {
  if (start === end) return false;
  return start < end ? hm >= start && hm < end : hm >= start || hm < end;
}

/** ถึงเวลา `at` แล้วและยังไม่เกิน `windowMin` นาที (ภายในวันเดียวกัน) */
export function inWindow(hm: string, at: string, windowMin = WINDOW_MIN): boolean {
  const d = toMin(hm) - toMin(at);
  return d >= 0 && d <= windowMin;
}

// ---------------------------------------------------------------- quota
export interface Quota {
  used: number;
  limit: number;
  limitConfigured: boolean;
  /** เคยได้ 429 (เต็ม) จาก LINE ในเดือนนี้ */
  blocked: boolean;
  month: string;
}

export async function loadQuota(env: Env, db: Db, at: Date): Promise<Quota> {
  const month = bangkokDate(at).slice(0, 7);
  const monthStart = fromBangkok(`${month}-01`).toISOString();
  const r = await db
    .select({
      used: sql<number>`coalesce(sum(case when ${notificationLog.ok} = 1 and ${notificationLog.kind} != ${QUOTA_HIT} then 1 else 0 end), 0)`,
      hits: sql<number>`coalesce(sum(case when ${notificationLog.kind} = ${QUOTA_HIT} then 1 else 0 end), 0)`,
    })
    .from(notificationLog)
    .where(and(eq(notificationLog.channel, 'line_push'), gte(notificationLog.sentAt, monthStart)))
    .get();
  const n = Number(env.PUSH_MONTHLY_LIMIT);
  const limitConfigured = Number.isInteger(n) && n > 0;
  return {
    used: Number(r?.used ?? 0),
    limit: limitConfigured ? n : 0,
    limitConfigured,
    blocked: Number(r?.hits ?? 0) > 0,
    month,
  };
}

export const quotaExhausted = (q: Quota) => !q.limitConfigured || q.blocked || q.used >= q.limit;

// ---------------------------------------------------------------- sending
interface RunCtx {
  env: Env;
  db: Db;
  at: Date;
  today: string;
  quota: Quota;
  pushes: number;
  sent: number;
  failed: number;
}
type SendResult = 'sent' | 'failed' | 'quota' | 'cap';

async function log(db: Db, userId: string, kind: string, ok: boolean, detail: string) {
  await db.insert(notificationLog).values({
    id: crypto.randomUUID(),
    userId,
    channel: 'line_push',
    kind,
    sentAt: nowIso(),
    ok: ok ? 1 : 0,
    detail,
  });
}

/** ส่ง push 1 ข้อความ: ตรวจโควตาก่อนทุกครั้ง, retry ≤ 2 ครั้ง (เฉพาะ 5xx/เครือข่าย) ด้วย retry key เดิม, log ผลลง notification_log */
async function send(
  rc: RunCtx,
  t: Target,
  kind: Kind,
  message: LineMessage,
  detail: string,
): Promise<SendResult> {
  if (quotaExhausted(rc.quota)) return 'quota';
  if (rc.pushes >= MAX_PUSHES_PER_RUN) return 'cap';
  rc.pushes++;
  const retryKey = crypto.randomUUID();
  let status = 0;
  for (let attempt = 0; attempt <= 2; attempt++) {
    const r = await pushMessage(rc.env, t.lineUserId, message, retryKey);
    status = r.status;
    if (r.ok) {
      await log(rc.db, t.userId, kind, true, `${detail};attempts=${attempt + 1}`);
      rc.quota.used++;
      rc.sent++;
      return 'sent';
    }
    if (r.status === 429) {
      await log(rc.db, t.userId, QUOTA_HIT, false, '429');
      rc.quota.blocked = true;
      return 'quota';
    }
    if (r.status >= 400 && r.status < 500) break; // ผิดฝั่งเรา/ผู้ใช้ (เช่น บล็อกบอท) ไม่ retry
    if (attempt < 2) await sleep(retryDelays.ms[attempt] ?? 0);
  }
  await log(rc.db, t.userId, kind, false, `http_${status}`); // ไม่ log เนื้อหาข้อความ/ชื่องาน
  rc.failed++;
  return 'failed';
}

// ---------------------------------------------------------------- state of the day
interface DayState {
  sent: Set<string>;
  failedKind: Map<string, number>;
  failedUser: Map<string, number>;
}

async function loadDayState(db: Db, userIds: string[], dayStartIso: string): Promise<DayState> {
  const st: DayState = { sent: new Set(), failedKind: new Map(), failedUser: new Map() };
  for (let i = 0; i < userIds.length; i += 40) {
    const rows = await db
      .select({
        userId: notificationLog.userId,
        kind: notificationLog.kind,
        ok: notificationLog.ok,
        n: sql<number>`count(*)`,
      })
      .from(notificationLog)
      .where(
        and(
          inArray(notificationLog.userId, userIds.slice(i, i + 40)),
          eq(notificationLog.channel, 'line_push'),
          gte(notificationLog.sentAt, dayStartIso),
          sql`${notificationLog.kind} != ${QUOTA_HIT}`,
        ),
      )
      .groupBy(notificationLog.userId, notificationLog.kind, notificationLog.ok);
    for (const r of rows) {
      const key = `${r.userId}|${r.kind}`;
      if (r.ok === 1) st.sent.add(key);
      else {
        st.failedKind.set(key, (st.failedKind.get(key) ?? 0) + Number(r.n));
        st.failedUser.set(r.userId, (st.failedUser.get(r.userId) ?? 0) + Number(r.n));
      }
    }
  }
  return st;
}

const dueDaily = (s: Settings, kind: Kind, hm: string): boolean =>
  kind === 'morning_digest'
    ? inWindow(hm, s.morningDigestTime)
    : kind === 'deadline_alert'
      ? inWindow(hm, s.deadlineAlertTime)
      : kind === 'evening_review'
        ? s.eveningReviewEnabled === 1 && inWindow(hm, s.eveningReviewTime)
        : false;

// ---------------------------------------------------------------- reminders
interface ReminderEvent {
  taskId: string;
  userId: string;
  kind: 'before' | 'due';
  at: string;
}

async function reminderCandidates(db: Db, active: Target[], at: Date): Promise<ReminderEvent[]> {
  const want = active.filter((t) => t.s.remindBeforeMinutes > 0);
  if (!want.length) return [];
  const nowStr = at.toISOString();
  const horizon = new Date(at.getTime() + HORIZON_MIN * MIN).toISOString();
  const byUser = new Map(want.map((t) => [t.userId, t]));
  const out: ReminderEvent[] = [];
  const ids = [...byUser.keys()];
  for (let i = 0; i < ids.length; i += 40) {
    const rows = await db
      .select()
      .from(tasks)
      .where(
        and(
          inArray(tasks.userId, ids.slice(i, i + 40)),
          inArray(tasks.status, [...OPEN]),
          or(
            and(gt(tasks.startAt, nowStr), lte(tasks.startAt, horizon)),
            and(gt(tasks.dueAt, nowStr), lte(tasks.dueAt, horizon)),
          ),
        ),
      )
      .limit(200);
    for (const r of rows) {
      const win = byUser.get(r.userId)!.s.remindBeforeMinutes * MIN;
      const within = (iso: string | null): iso is string =>
        !!iso && iso > nowStr && Date.parse(iso) - at.getTime() <= win;
      // งานละ 1 เหตุการณ์ต่อรอบ: เริ่มงานก่อน แล้วค่อยเดดไลน์ (ทีหลังยังเตือนได้ในรอบถัดไป)
      if (within(r.startAt))
        out.push({ taskId: r.id, userId: r.userId, kind: 'before', at: r.startAt });
      else if (within(r.dueAt))
        out.push({ taskId: r.id, userId: r.userId, kind: 'due', at: r.dueAt });
    }
  }
  return out;
}

async function runReminders(
  rc: RunCtx,
  active: Target[],
  events: ReminderEvent[],
  state: DayState,
) {
  if (!events.length) return;
  // กรองที่เคยเตือนแล้ว (ตรงทั้งงาน+ชนิด+เวลา: เลื่อนเวลางานแล้วจะเตือนใหม่)
  const sentKeys = new Set<string>();
  const taskIds = [...new Set(events.map((e) => e.taskId))];
  for (let i = 0; i < taskIds.length; i += 50) {
    const rows = await rc.db
      .select()
      .from(reminders)
      .where(and(inArray(reminders.taskId, taskIds.slice(i, i + 50)), isNotNull(reminders.sentAt)));
    for (const r of rows) sentKeys.add(`${r.taskId}|${r.kind}|${r.remindAt}`);
  }
  const fresh = events.filter((e) => !sentKeys.has(`${e.taskId}|${e.kind}|${e.at}`));
  if (!fresh.length) return;

  const rows = await rc.db
    .select()
    .from(tasks)
    .where(inArray(tasks.id, [...new Set(fresh.map((e) => e.taskId))].slice(0, 50)));
  const dtos = new Map((await withTags(rc.db, rows)).map((t) => [t.id, t]));
  const base = rc.env.APP_BASE_URL.replace(/\/$/, '');

  for (const t of active) {
    const mine = fresh
      .filter((e) => e.userId === t.userId)
      .sort((a, b) => a.at.localeCompare(b.at));
    if (!mine.length) continue;
    if ((state.failedUser.get(t.userId) ?? 0) >= MAX_FAILURES_PER_USER_PER_DAY) continue;
    const items: AlertItem[] = [];
    for (const e of mine) {
      const task = dtos.get(e.taskId);
      if (!task) continue;
      const mins = Math.max(1, Math.ceil((Date.parse(e.at) - rc.at.getTime()) / MIN));
      items.push({
        task,
        label: e.kind === 'before' ? `⏰ อีก ${mins} นาที` : `📌 เดดไลน์อีก ${mins} นาที`,
      });
    }
    if (!items.length) continue;
    const r = await send(rc, t, 'reminder', alertCarousel(items, base), `n=${items.length}`);
    if (r === 'sent') {
      await rc.db.insert(reminders).values(
        mine.map((e) => ({
          id: crypto.randomUUID(),
          taskId: e.taskId,
          remindAt: e.at,
          sentAt: nowIso(),
          kind: e.kind,
        })),
      );
    }
    if (r === 'cap' || r === 'quota') break;
  }
}

// ---------------------------------------------------------------- daily notifications
const score = (t: TaskDto) => t.urgency * t.importance;
const bySmart = (a: TaskDto, b: TaskDto) =>
  score(b) - score(a) || (a.startAt ?? a.dueAt ?? '').localeCompare(b.startAt ?? b.dueAt ?? '');

async function runDaily(rc: RunCtx, t: Target, kind: Kind): Promise<SendResult | 'empty'> {
  const { db, at, today } = rc;
  const base = rc.env.APP_BASE_URL.replace(/\/$/, '');

  if (kind === 'morning_digest') {
    const b = await todayBuckets(db, t.userId, at);
    const sections: ListSection[] = [
      { title: '🔴 เลยกำหนด', color: '#dc2626', tasks: [...b.overdue].sort(bySmart) },
      { title: '⏰ เดดไลน์วันนี้', color: '#ea580c', tasks: [...b.dueToday].sort(bySmart) },
      { title: 'งานวันนี้', tasks: [...b.today].sort(bySmart) },
    ];
    const total = b.overdue.length + b.dueToday.length + b.today.length;
    if (!total) return 'empty'; // วันนี้ไม่มีงาน = ไม่ส่ง (ประหยัดโควตา)
    const { message, ids } = listCard(`🌅 สรุปงานวันนี้ ${dayLabel(b.date)}`, sections, base);
    const r = await send(rc, t, kind, message, `n=${total}`);
    if (r === 'sent') await setList(db, t.lineUserId, ids); // ให้ตอบ "เสร็จ 1" ได้ทันที
    return r;
  }

  if (kind === 'deadline_alert') {
    const start = fromBangkok(today).toISOString();
    const end = fromBangkok(addOne(today)).toISOString();
    const rows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, t.userId),
          inArray(tasks.status, [...OPEN]),
          gte(tasks.dueAt, start),
          lt(tasks.dueAt, end),
        ),
      )
      .orderBy(tasks.dueAt)
      .limit(50);
    if (!rows.length) return 'empty';
    const items: AlertItem[] = (await withTags(db, rows)).map((task) => ({
      task,
      label:
        Date.parse(task.dueAt!) < at.getTime()
          ? '🔴 เลยเดดไลน์แล้ว'
          : `📌 เดดไลน์วันนี้ ${bangkokHm(new Date(task.dueAt!))} น.`,
    }));
    return send(rc, t, kind, alertCarousel(items, base), `n=${items.length}`);
  }

  // evening_review
  const b = await todayBuckets(db, t.userId, at);
  const all = [...b.overdue, ...b.dueToday, ...b.today];
  const pending = all.filter((x) => taskDate(x) === today).sort(bySmart);
  const overdueBefore = b.overdue.filter((x) => (taskDate(x) ?? today) < today).length;
  const start = fromBangkok(today).toISOString();
  const end = fromBangkok(addOne(today)).toISOString();
  const doneRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, t.userId),
        eq(tasks.status, 'done'),
        gte(tasks.completedAt, start),
        lt(tasks.completedAt, end),
      ),
    )
    .limit(50);
  if (!doneRows.length && !pending.length) return 'empty';
  const { message, ids } = eveningCard(
    today,
    await withTags(db, doneRows),
    pending,
    overdueBefore,
    base,
  );
  const r = await send(rc, t, kind, message, `done=${doneRows.length};pending=${pending.length}`);
  if (r === 'sent') await setList(db, t.lineUserId, ids);
  return r;
}

const addOne = (d: string): string => {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, dd + 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- entry
export interface RunSummary {
  eligible: number;
  sent: number;
  failed: number;
  /** หยุดเพราะโควตา push เต็ม/ไม่ได้ตั้งค่า */
  quotaStop: boolean;
}

export async function runNotifications(env: Env): Promise<RunSummary> {
  const db = getDb(env.DB);
  const at = now();
  const today = bangkokDate(at);
  const hm = bangkokHm(at);
  const summary: RunSummary = { eligible: 0, sent: 0, failed: 0, quotaStop: false };

  const targets: Target[] = (
    await db
      .select({ userId: users.id, lineUserId: users.lineUserId, s: userSettings })
      .from(users)
      .innerJoin(userSettings, eq(userSettings.userId, users.id))
      .where(and(isNotNull(users.lineUserId), eq(userSettings.lineNotifyEnabled, 1)))
  ).map((r) => ({ userId: r.userId, lineUserId: r.lineUserId!, s: r.s }));
  summary.eligible = targets.length;

  // ข้ามผู้ใช้ที่อยู่ใน quiet hours (ไม่ส่งเลย)
  const active = targets.filter((t) => !isQuietHours(hm, t.s.quietHoursStart, t.s.quietHoursEnd));
  if (!active.length) return summary;

  const dailyJobs = DAILY.flatMap((kind) =>
    active.filter((t) => dueDaily(t.s, kind, hm)).map((t) => ({ t, kind })),
  );
  const events = await reminderCandidates(db, active, at);
  if (!dailyJobs.length && !events.length) return summary; // รอบส่วนใหญ่จบที่นี่ (query แค่ 1–2 ครั้ง)

  const quota = await loadQuota(env, db, at);
  if (quotaExhausted(quota)) {
    summary.quotaStop = true;
    return summary;
  }
  const rc: RunCtx = { env, db, at, today, quota, pushes: 0, sent: 0, failed: 0 };
  const state = await loadDayState(
    db,
    active.map((t) => t.userId),
    fromBangkok(today).toISOString(),
  );

  await runReminders(rc, active, events, state); // เตือนก่อนเวลาสำคัญสุด (ไวต่อเวลา)

  for (const { t, kind } of dailyJobs) {
    if (rc.pushes >= MAX_PUSHES_PER_RUN || quotaExhausted(rc.quota)) break;
    const key = `${t.userId}|${kind}`;
    if (state.sent.has(key)) continue; // วันนี้ส่งแล้ว
    if ((state.failedKind.get(key) ?? 0) >= MAX_ATTEMPTS_PER_KIND_PER_DAY) continue;
    if ((state.failedUser.get(t.userId) ?? 0) >= MAX_FAILURES_PER_USER_PER_DAY) continue;
    await runDaily(rc, t, kind);
  }
  summary.sent = rc.sent;
  summary.failed = rc.failed;
  summary.quotaStop = quotaExhausted(rc.quota);
  return summary;
}

/** สถานะโควตา push ของเดือนนี้ (ใช้แสดงเตือนในเว็บ) */
export async function notificationStatus(env: Env, db: Db, at: Date = now()) {
  const q = await loadQuota(env, db, at);
  return {
    month: q.month,
    used: q.used,
    limit: q.limit,
    limitConfigured: q.limitConfigured,
    blocked: q.blocked,
    nearLimit: q.limitConfigured && q.used >= q.limit * 0.8,
    exhausted: quotaExhausted(q),
  };
}

import { and, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { focusSessions, tasks, userSettings } from '../db/schema';
import { computeUrgency } from '../lib/urgency';
import { addDays, bangkokDate, fromBangkok } from '../lib/time';
import { parseWorkDays } from '../lib/work';
import { withTags, type TaskDto } from './tasks';

/**
 * แดชบอร์ด (หน้า "วันนี้"): ภาพรวมทั้งเดือน — เดดไลน์, งานสำคัญ, ประสิทธิภาพ, ภาระงาน 7 วัน, สิ่งที่ควรจัดการ
 * ฟังก์ชันคำนวณเป็นฟังก์ชันบริสุทธิ์ (ทดสอบได้) แล้ว `dashboard()` ประกอบจาก D1 ด้วย query จำนวนน้อย (เพดาน subrequest ฟรี)
 */
const OPEN = ['todo', 'doing'] as const;
const MONTH_CAP = 150;
const WEEK_CAP = 100;
const WEEKS = 8;

type Row = typeof tasks.$inferSelect;
type DeadlineLike = Pick<Row, 'dueAt' | 'dueDate'>;

export const isMonth = (s: string | undefined): s is string =>
  !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { start: `${month}-01`, end: `${next}-01` };
};

/** วันของเดดไลน์ (เวลาไทย): dueAt ก่อน แล้ว dueDate */
export const deadlineDate = (t: DeadlineLike): string | null =>
  t.dueAt ? bangkokDate(new Date(t.dueAt)) : t.dueDate;
/** เวลาสิ้นสุดของเดดไลน์ (ISO): dueAt หรือสิ้นวันของ dueDate */
const deadlineEnd = (t: DeadlineLike): string | null =>
  t.dueAt ?? (t.dueDate ? fromBangkok(addDays(t.dueDate, 1)).toISOString() : null);

export interface DayCount {
  open: number;
  done: number;
}
export interface DeadlineSummary {
  open: number;
  done: number;
  overdue: number;
  /** อัตราเสร็จของเดดไลน์ในเดือน (0–100) */
  completionRate: number;
  /** ในงานที่เสร็จแล้ว ส่งทันกำหนดกี่ % (null = ยังไม่มีงานเสร็จ) */
  onTimeRate: number | null;
  perDay: Record<string, DayCount>;
  byCategory: { categoryId: string | null; open: number; done: number }[];
}

export function summarizeDeadlines(
  rows: Pick<Row, 'status' | 'dueAt' | 'dueDate' | 'completedAt' | 'categoryId'>[],
  today: string,
  nowIso: string,
): DeadlineSummary {
  const perDay: Record<string, DayCount> = {};
  const cat = new Map<string | null, { open: number; done: number }>();
  let open = 0;
  let done = 0;
  let overdue = 0;
  let onTime = 0;
  for (const r of rows) {
    const d = deadlineDate(r);
    if (!d || r.status === 'cancelled') continue;
    const isDone = r.status === 'done';
    const p = (perDay[d] ??= { open: 0, done: 0 });
    const c = cat.get(r.categoryId) ?? { open: 0, done: 0 };
    if (isDone) {
      done++;
      p.done++;
      c.done++;
      const end = deadlineEnd(r);
      if (r.completedAt && end && r.completedAt <= end) onTime++;
    } else {
      open++;
      p.open++;
      c.open++;
      const end = deadlineEnd(r);
      if (d < today || (end && r.dueAt && end < nowIso)) overdue++;
    }
    cat.set(r.categoryId, c);
  }
  const total = open + done;
  return {
    open,
    done,
    overdue,
    completionRate: total ? Math.round((done / total) * 100) : 0,
    onTimeRate: done ? Math.round((onTime / done) * 100) : null,
    perDay,
    byCategory: [...cat].map(([categoryId, v]) => ({ categoryId, ...v })),
  };
}

/** จันทร์ของสัปดาห์ที่ ymd อยู่ */
const mondayOf = (ymd: string): string => {
  const wd = new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0=อาทิตย์
  return addDays(ymd, -((wd + 6) % 7));
};

export interface WeekBucket {
  weekStart: string;
  done: number;
}
/** จำนวนงานที่เสร็จต่อสัปดาห์ ย้อนหลัง n สัปดาห์ (สัปดาห์ล่าสุดคือสัปดาห์นี้) */
export function weeklyDone(doneDays: string[], today: string, n = WEEKS): WeekBucket[] {
  const cur = mondayOf(today);
  const out: WeekBucket[] = Array.from({ length: n }, (_, i) => ({
    weekStart: addDays(cur, -7 * (n - 1 - i)),
    done: 0,
  }));
  const idx = new Map(out.map((w, i) => [w.weekStart, i]));
  for (const d of doneDays) {
    const i = idx.get(mondayOf(d));
    if (i !== undefined) out[i]!.done++;
  }
  return out;
}

/** วันติดกันที่มีงานเสร็จ ≥ 1 (ถ้าวันนี้ยังไม่มี นับต่อจากเมื่อวานได้ — ไม่ตัดสตรีคกลางวัน) */
export function streak(doneDays: string[], today: string): number {
  const days = new Set(doneDays);
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** คะแนนงานสำคัญ (สเปค 11): urgency×2 + importance×2 + ความใกล้เดดไลน์ (0–4) */
export function importantScore(
  t: { urgency: number; importance: number; dueAt: string | null; dueDate: string | null },
  today: string,
): number {
  const d = deadlineDate(t);
  let near = 0;
  if (d) {
    const days = Math.round(
      (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
    );
    near = days <= 0 ? 4 : days <= 3 ? 3 : days <= 7 ? 2 : days <= 14 ? 1 : 0;
  }
  return t.urgency * 2 + t.importance * 2 + near;
}

export interface LiteTask {
  id: string;
  title: string;
  status: Row['status'];
  allDay: boolean;
  startAt: string | null;
  endAt: string | null;
  dueAt: string | null;
  dueDate: string | null;
  estimateMinutes: number | null;
  urgency: number;
  importance: number;
  snoozeCount: number;
}

export async function dashboard(db: Db, userId: string, at: Date, monthParam?: string) {
  const today = bangkokDate(at);
  const nowStr = at.toISOString();
  const month = isMonth(monthParam) ? monthParam : today.slice(0, 7);
  const { start, end } = monthRange(month);
  const mStartIso = fromBangkok(start).toISOString();
  const mEndIso = fromBangkok(end).toISOString();

  // 1) เดดไลน์ของเดือน (เปิดอยู่ + เสร็จแล้ว)
  const monthRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        inArray(tasks.status, ['todo', 'doing', 'done']),
        or(
          and(gte(tasks.dueDate, start), lt(tasks.dueDate, end)),
          and(gte(tasks.dueAt, mStartIso), lt(tasks.dueAt, mEndIso)),
        ),
      ),
    )
    .limit(MONTH_CAP + 1);
  const monthTruncated = monthRows.length > MONTH_CAP;
  const monthTasks = await withTags(db, monthRows.slice(0, MONTH_CAP));
  const deadlines = summarizeDeadlines(monthTasks, today, nowStr);

  // 2) งานสำคัญที่ต้องทำ (เปิดอยู่, importance ≥ 3) — เรียงตามคะแนน แล้วเอา 8 อันดับแรก
  const impRows = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.userId, userId), inArray(tasks.status, [...OPEN]), gte(tasks.importance, 3)),
    )
    .limit(300);
  const topRows = impRows
    .map((r) => ({ r, s: importantScore({ ...r, urgency: computeUrgency(r, at) }, today) }))
    .sort((a, b) => b.s - a.s || (deadlineDate(a.r) ?? '9').localeCompare(deadlineDate(b.r) ?? '9'))
    .slice(0, 8);
  const important: TaskDto[] = topRows.length
    ? await withTags(
        db,
        topRows.map((x) => x.r),
      )
    : [];

  // 3) ประสิทธิภาพ: งานที่เสร็จใน 90 วันล่าสุด → สตรีค + สัปดาห์ละกี่งาน
  const since = fromBangkok(addDays(today, -90)).toISOString();
  const doneRows = await db
    .select({ c: tasks.completedAt })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.status, 'done'), gte(tasks.completedAt, since)))
    .limit(3000);
  const doneDays = doneRows.filter((x) => x.c).map((x) => bangkokDate(new Date(x.c!)));
  const weekly = weeklyDone(doneDays, today);
  const focus = await db
    .select({ m: sql<number>`coalesce(sum(${focusSessions.minutes}), 0)` })
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        gte(focusSessions.startedAt, fromBangkok(addDays(mondayOf(today), 0)).toISOString()),
      ),
    )
    .get();

  // 4) งาน 7 วันข้างหน้า (ให้ฝั่งเว็บคำนวณภาระงานรายวัน) — เฉพาะฟิลด์ที่ใช้คิดภาระ
  const wStart = fromBangkok(today).toISOString();
  const wEnd = fromBangkok(addDays(today, 7)).toISOString();
  const weekRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        inArray(tasks.status, [...OPEN]),
        or(
          and(gte(tasks.startAt, wStart), lt(tasks.startAt, wEnd)),
          and(gte(tasks.dueAt, wStart), lt(tasks.dueAt, wEnd)),
          and(gte(tasks.dueDate, today), lt(tasks.dueDate, addDays(today, 7))),
        ),
      ),
    )
    .limit(WEEK_CAP);
  const week: LiteTask[] = weekRows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    allDay: r.allDay === 1,
    startAt: r.startAt,
    endAt: r.endAt,
    dueAt: r.dueAt,
    dueDate: r.dueDate,
    estimateMinutes: r.estimateMinutes,
    urgency: computeUrgency(r, at),
    importance: r.importance,
    snoozeCount: r.snoozeCount,
  }));

  // 5) ควรจัดการ: ถูกเลื่อนบ่อย / ค้าง / ยังไม่ตั้งวัน
  const stalledRows = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.userId, userId), inArray(tasks.status, [...OPEN]), gte(tasks.snoozeCount, 2)),
    )
    .orderBy(sql`${tasks.snoozeCount} desc`)
    .limit(5);
  const stalled = stalledRows.length ? await withTags(db, stalledRows) : [];
  const counts = await db
    .select({
      overdue: sql<number>`coalesce(sum(case when (${tasks.dueDate} < ${today} or ${tasks.dueAt} < ${nowStr}) then 1 else 0 end), 0)`,
      unscheduled: sql<number>`coalesce(sum(case when ${tasks.startAt} is null and ${tasks.dueAt} is null and ${tasks.dueDate} is null then 1 else 0 end), 0)`,
    })
    .from(tasks)
    .where(
      and(eq(tasks.userId, userId), inArray(tasks.status, [...OPEN]), isNull(tasks.parentTaskId)),
    )
    .get();

  const s = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  return {
    today,
    month,
    work: {
      start: s?.workStart ?? '09:00',
      end: s?.workEnd ?? '18:00',
      days: parseWorkDays(s?.workDays),
    },
    deadlines: {
      ...deadlines,
      /** งานเดดไลน์ของเดือน (เปิดอยู่ก่อน เรียงตามวัน) */
      tasks: monthTasks
        .filter((t) => t.status !== 'done')
        .sort(
          (a, b) =>
            (deadlineDate(a) ?? '').localeCompare(deadlineDate(b) ?? '') || b.urgency - a.urgency,
        ),
      truncated: monthTruncated,
    },
    important,
    performance: {
      weekly,
      doneThisWeek: weekly[weekly.length - 1]?.done ?? 0,
      doneLastWeek: weekly[weekly.length - 2]?.done ?? 0,
      streak: streak(doneDays, today),
      focusMinutesWeek: Number(focus?.m ?? 0),
    },
    week,
    attention: {
      stalled,
      overdue: Number(counts?.overdue ?? 0),
      unscheduled: Number(counts?.unscheduled ?? 0),
    },
  };
}

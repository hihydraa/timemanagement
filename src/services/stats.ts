import { and, eq, gte, inArray, isNotNull, isNull, lt, ne, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { categories, focusSessions, tasks } from '../db/schema';
import { addDays, bangkokDate, fromBangkok, now } from '../lib/time';
import { anchorDateOf, loadSeriesInstances } from './series';

type TaskRow = typeof tasks.$inferSelect;

export const mondayOf = (d: string): string => {
  const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
  return addDays(d, -((wd + 6) % 7));
};
const dateOf = (iso: string) => bangkokDate(new Date(iso));
const OPEN = new Set(['todo', 'doing']);
const rate = (done: number, total: number) =>
  total === 0 ? null : Math.round((done / total) * 1000) / 10;

/**
 * นิยามเดียวของ "อัตราสำเร็จ" ที่ใช้ทั้งหน้ารีวิวและสถิติ:
 * (งานที่กำหนดไว้ในช่วง ที่สถานะเสร็จแล้ว) ÷ (งานที่กำหนดไว้ในช่วงทั้งหมด ไม่นับที่ยกเลิก)
 * ต่างจาก "งานที่เสร็จ" ซึ่งนับตามวันที่ทำเสร็จจริงโดยไม่สนว่ากำหนดไว้ช่วงไหน
 */
export function completionOf(scheduled: { status: string }[]) {
  const scheduledDone = scheduled.filter((t) => t.status === 'done').length;
  return {
    scheduled: scheduled.length,
    scheduledDone,
    completionRate: rate(scheduledDone, scheduled.length),
  };
}

/** งานที่ "กำหนด" ในช่วงวันที่ (ตามวันเริ่ม/เดดไลน์/ทั้งวัน) ไม่รวมที่ยกเลิก — แถวจริง + ครั้งเสมือนที่ยังไม่มีแถว (นับเป็นยังไม่ทำ) */
async function scheduledIn(db: Db, userId: string, from: string, to: string): Promise<TaskRow[]> {
  const start = fromBangkok(from).toISOString();
  const end = fromBangkok(addDays(to, 1)).toISOString();
  const real = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        ne(tasks.status, 'cancelled'),
        or(
          and(gte(tasks.startAt, start), lt(tasks.startAt, end)),
          and(isNull(tasks.startAt), gte(tasks.dueAt, start), lt(tasks.dueAt, end)),
          and(
            isNotNull(tasks.dueDate),
            gte(tasks.dueDate, from),
            lt(tasks.dueDate, addDays(to, 1)),
          ),
        ),
      ),
    )
    .limit(2000);
  const virt = await loadSeriesInstances(db, [userId], from, to);
  return [...real, ...virt];
}

interface Cat {
  id: string | null;
  name: string;
  color: string;
}

async function categoryMap(db: Db, userId: string): Promise<Map<string, Cat>> {
  const rows = await db.select().from(categories).where(eq(categories.userId, userId));
  return new Map(rows.map((c) => [c.id, { id: c.id, name: c.name, color: c.color }]));
}

/** นาทีโฟกัสในช่วง แยกตามประเภทของงาน */
async function focusByCategory(db: Db, userId: string, from: string, to: string) {
  const sessions = await db
    .select()
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        gte(focusSessions.startedAt, fromBangkok(from).toISOString()),
        lt(focusSessions.startedAt, fromBangkok(addDays(to, 1)).toISOString()),
      ),
    )
    .limit(5000);
  const taskIds = [...new Set(sessions.map((s) => s.taskId).filter((x): x is string => !!x))];
  const catOf = new Map<string, string | null>();
  for (let i = 0; i < taskIds.length; i += 50) {
    const rows = await db
      .select({ id: tasks.id, categoryId: tasks.categoryId })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds.slice(i, i + 50))));
    for (const r of rows) catOf.set(r.id, r.categoryId);
  }
  const byCat = new Map<string | null, number>();
  let total = 0;
  for (const s of sessions) {
    const key = s.taskId ? (catOf.get(s.taskId) ?? null) : null;
    byCat.set(key, (byCat.get(key) ?? 0) + s.minutes);
    total += s.minutes;
  }
  return { byCat, total };
}

const brief = (t: TaskRow) => ({
  id: t.id,
  title: t.title,
  status: t.status,
  categoryId: t.categoryId,
  date: anchorDateOf(t),
  completedAt: t.completedAt,
  urgency: t.urgency,
  importance: t.importance,
});

// ---------------------------------------------------------------- weekly review
export async function weeklyStats(
  db: Db,
  userId: string,
  weekParam: string | null,
  at: Date = now(),
) {
  const today = bangkokDate(at);
  const weekStart = mondayOf(weekParam ?? addDays(mondayOf(today), -7)); // ค่าเริ่มต้น = สัปดาห์ที่แล้ว
  const weekEnd = addDays(weekStart, 6);
  const start = fromBangkok(weekStart).toISOString();
  const end = fromBangkok(addDays(weekEnd, 1)).toISOString();
  const cats = await categoryMap(db, userId);

  const completed = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.status, 'done'),
        gte(tasks.completedAt, start),
        lt(tasks.completedAt, end),
      ),
    )
    .limit(1000);
  // ครั้งเสมือนที่ผ่านมา/วันนี้เท่านั้นที่นับเป็นงานที่ต้องทำ (อนาคตยังไม่ถึง)
  const scheduled = (await scheduledIn(db, userId, weekStart, weekEnd)).filter(
    (t) => (anchorDateOf(t) ?? weekEnd) <= today || !t.id.includes('~'),
  );
  const notDone = scheduled.filter((t) => OPEN.has(t.status));
  const overdueOpen = notDone.filter((t) => (anchorDateOf(t) ?? today) < today);

  const { byCat, total: focusMinutes } = await focusByCategory(db, userId, weekStart, weekEnd);
  const planned = new Map<string | null, number>();
  const doneCount = new Map<string | null, number>();
  for (const t of completed) {
    planned.set(t.categoryId, (planned.get(t.categoryId) ?? 0) + (t.estimateMinutes ?? 0));
    doneCount.set(t.categoryId, (doneCount.get(t.categoryId) ?? 0) + 1);
  }
  const keys = new Set<string | null>([...byCat.keys(), ...planned.keys(), ...doneCount.keys()]);
  const byCategory = [...keys]
    .map((k) => {
      const c = k ? cats.get(k) : undefined;
      return {
        categoryId: k,
        name: c?.name ?? 'ไม่มีประเภท',
        color: c?.color ?? '#64748b',
        focusMinutes: byCat.get(k) ?? 0,
        plannedMinutes: planned.get(k) ?? 0,
        completed: doneCount.get(k) ?? 0,
      };
    })
    .sort((a, b) => b.focusMinutes + b.plannedMinutes - (a.focusMinutes + a.plannedMinutes));

  // สัปดาห์ถัดไปสำหรับวางแผน (งานที่กำหนดไว้แล้ว ยังไม่เสร็จ)
  const nextStart = addDays(weekStart, 7);
  const nextEnd = addDays(nextStart, 6);
  const next = (await scheduledIn(db, userId, nextStart, nextEnd)).filter((t) =>
    OPEN.has(t.status),
  );

  return {
    weekStart,
    weekEnd,
    completed: completed.length,
    ...completionOf(scheduled),
    overdueOpen: overdueOpen.length,
    focusMinutes,
    byCategory,
    completedTasks: completed.slice(0, 20).map(brief),
    notDoneTasks: notDone.slice(0, 20).map(brief),
    nextWeek: {
      weekStart: nextStart,
      weekEnd: nextEnd,
      total: next.length,
      tasks: next.slice(0, 30).map(brief),
    },
  };
}

// ---------------------------------------------------------------- overview
export async function overviewStats(db: Db, userId: string, days: number, at: Date = now()) {
  const today = bangkokDate(at);
  const from = addDays(today, -(days - 1));
  const cats = await categoryMap(db, userId);

  const completedRows = await db
    .select({ completedAt: tasks.completedAt, categoryId: tasks.categoryId })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.status, 'done'),
        gte(tasks.completedAt, fromBangkok(addDays(today, -120)).toISOString()),
      ),
    )
    .limit(5000);
  const doneByDate = new Map<string, number>();
  for (const r of completedRows) {
    const d = dateOf(r.completedAt!);
    doneByDate.set(d, (doneByDate.get(d) ?? 0) + 1);
  }

  const scheduled = (await scheduledIn(db, userId, from, today)).filter(
    (t) => (anchorDateOf(t) ?? today) <= today,
  );
  const schedByDate = new Map<string, number>();
  for (const t of scheduled) {
    const d = anchorDateOf(t);
    if (d) schedByDate.set(d, (schedByDate.get(d) ?? 0) + 1);
  }

  const daily = Array.from({ length: days }, (_, i) => {
    const d = addDays(from, i);
    return { date: d, completed: doneByDate.get(d) ?? 0, scheduled: schedByDate.get(d) ?? 0 };
  });

  const completedInRange = completedRows.filter((r) => dateOf(r.completedAt!) >= from);
  const doneCat = new Map<string | null, number>();
  for (const r of completedInRange) doneCat.set(r.categoryId, (doneCat.get(r.categoryId) ?? 0) + 1);
  const { byCat, total: focusMinutes } = await focusByCategory(db, userId, from, today);
  const keys = new Set<string | null>([...byCat.keys(), ...doneCat.keys()]);
  const byCategory = [...keys]
    .map((k) => {
      const c = k ? cats.get(k) : undefined;
      return {
        categoryId: k,
        name: c?.name ?? 'ไม่มีประเภท',
        color: c?.color ?? '#64748b',
        focusMinutes: byCat.get(k) ?? 0,
        completed: doneCat.get(k) ?? 0,
      };
    })
    .sort((a, b) => b.focusMinutes + b.completed - (a.focusMinutes + a.completed));

  // streak: วันติดกันที่ทำงานเสร็จอย่างน้อย 1 งาน (วันนี้ยังไม่ทำไม่ตัด streak ถ้าเมื่อวานทำ)
  let current = 0;
  let cursor = doneByDate.has(today) ? today : addDays(today, -1);
  while (doneByDate.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  let best = 0;
  let run = 0;
  for (let i = 120; i >= 0; i--) {
    if (doneByDate.has(addDays(today, -i))) best = Math.max(best, ++run);
    else run = 0;
  }

  const weekStart = mondayOf(today);
  const open = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), inArray(tasks.status, ['todo', 'doing'])))
    .limit(5000);
  return {
    days,
    from,
    to: today,
    ...completionOf(scheduled),
    completedTotal: completedInRange.length,
    focusMinutes,
    daily,
    byCategory,
    streak: { current, best },
    totals: {
      open: open.length,
      doneThisWeek: completedRows.filter((r) => dateOf(r.completedAt!) >= weekStart).length,
    },
  };
}

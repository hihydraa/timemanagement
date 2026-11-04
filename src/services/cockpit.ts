import { and, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { focusSessions, tasks, userSettings } from '../db/schema';
import { addDays, bangkokDate, fromBangkok, nowIso } from '../lib/time';
import { parseWorkDays } from '../lib/work';
import { CARRY_MAX, todayBuckets, withTags, type TaskDto } from './tasks';

/**
 * ข้อมูลหน้า "วันนี้" ในคำขอเดียว: งานค้าง/เดดไลน์วันนี้/งานวันนี้ (ที่ยังไม่เสร็จ) + งานของวันนี้ที่เสร็จแล้ว
 * + นาทีโฟกัสวันนี้ + ชั่วโมงทำงานของผู้ใช้ (ให้ฝั่งเว็บคำนวณภาระงานและ timeline)
 */
export async function cockpit(db: Db, userId: string, at: Date) {
  const b = await todayBuckets(db, userId, at);
  const start = fromBangkok(b.date).toISOString();
  const end = fromBangkok(addDays(b.date, 1)).toISOString();

  const doneRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.status, 'done'),
        or(
          and(gte(tasks.startAt, start), lt(tasks.startAt, end)),
          and(isNull(tasks.startAt), gte(tasks.dueAt, start), lt(tasks.dueAt, end)),
          eq(tasks.dueDate, b.date),
        ),
      ),
    )
    .limit(200);
  const doneToday = await withTags(db, doneRows);

  const focus = await db
    .select({ m: sql<number>`coalesce(sum(${focusSessions.minutes}), 0)` })
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.userId, userId),
        gte(focusSessions.startedAt, start),
        lt(focusSessions.startedAt, end),
      ),
    )
    .get();

  const s = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  return {
    date: b.date,
    now: at.toISOString(),
    work: {
      start: s?.workStart ?? '09:00',
      end: s?.workEnd ?? '18:00',
      days: parseWorkDays(s?.workDays),
    },
    overdue: b.overdue,
    dueToday: b.dueToday,
    today: b.today,
    doneToday,
    focusMinutes: Number(focus?.m ?? 0),
  };
}

/**
 * เลื่อนงานที่เลยกำหนดทั้งหมด (ไม่รวมงานในซีรีส์) ไป "วันนี้" หรือ "พรุ่งนี้" ครั้งละไม่เกิน CARRY_MAX งาน
 * (เพดานของ Worker ฟรี) — เรียกซ้ำได้จนกว่า hasMore = false; เวลาในวันคงเดิม (ถ้าย้ายมาวันนี้แล้วเวลาผ่านไปแล้ว ตั้งเป็นสิ้นวัน)
 */
export async function rescheduleOverdue(
  db: Db,
  userId: string,
  to: 'today' | 'tomorrow',
  at: Date,
): Promise<{ movedIds: string[]; hasMore: boolean }> {
  const b = await todayBuckets(db, userId, at);
  const movable = b.overdue.filter((t) => !t.recurrenceRule && !t.parentTaskId);
  const batch = movable.slice(0, CARRY_MAX);
  if (!batch.length) return { movedIds: [], hasMore: false };

  const target = to === 'today' ? b.date : addDays(b.date, 1);
  const endOfTarget = new Date(fromBangkok(addDays(target, 1)).getTime() - 60_000).toISOString();
  const nowStr = at.toISOString();
  const dayMs = 86_400_000;
  const dayDiff = (a: string, z: string) =>
    Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${z}T00:00:00Z`)) / dayMs);

  const stmts = batch.map((t) => {
    const anchor = t.dueAt
      ? bangkokDate(new Date(t.dueAt))
      : (t.dueDate ?? (t.startAt ? bangkokDate(new Date(t.startAt)) : target));
    const delta = dayDiff(target, anchor);
    const shift = (s: string | null) =>
      s ? new Date(Date.parse(s) + delta * dayMs).toISOString() : null;
    let dueAt = shift(t.dueAt);
    if (dueAt && dueAt < nowStr) dueAt = endOfTarget; // เวลาในวันนี้ผ่านไปแล้ว: เลื่อนเป็นสิ้นวัน ไม่ให้ยังค้างเป็น "เลยกำหนด"
    return db
      .update(tasks)
      .set({
        startAt: shift(t.startAt),
        endAt: shift(t.endAt),
        dueAt,
        dueDate: t.dueDate ? addDays(t.dueDate, delta) : null,
        snoozeCount: sql`${tasks.snoozeCount} + 1`,
        updatedAt: nowIso(),
      })
      .where(
        and(eq(tasks.id, t.id), eq(tasks.userId, userId), inArray(tasks.status, ['todo', 'doing'])),
      );
  });
  await db.batch(stmts as unknown as [(typeof stmts)[number], ...(typeof stmts)[number][]]);
  return { movedIds: batch.map((t) => t.id), hasMore: movable.length > CARRY_MAX };
}

export type CockpitData = Awaited<ReturnType<typeof cockpit>>;
export type { TaskDto };

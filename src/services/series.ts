import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import { taskTags, tasks } from '../db/schema';
import { ApiError } from '../lib/http';
import { addDays, bangkokDate, nowIso } from '../lib/time';
import { isOccurrence, occurrences, parseRule } from './recurrence';
import { copySubtasks } from './subtasks';

/**
 * งานทำซ้ำ: งานแม่ (recurrence_rule) เก็บครั้งแรก (anchor) และกฎ
 * ครั้งถัดไปเป็น "instance เสมือน" id = `<แม่>~<YYYY-MM-DD>` ที่ขยายตอน query
 * เมื่อมีการแก้/ทำเสร็จ/ลบ instance จึงสร้าง "แถวจริง" (parent_task_id + recurrence_id) มาแทน
 */
type TaskRow = typeof tasks.$inferSelect;

const VIRTUAL_RE = /^([0-9a-f-]{36})~(\d{4}-\d{2}-\d{2})$/;
export const virtualId = (parentId: string, date: string) => `${parentId}~${date}`;
export function parseVirtualId(id: string): { parentId: string; date: string } | null {
  const m = VIRTUAL_RE.exec(id);
  return m ? { parentId: m[1]!, date: m[2]! } : null;
}
export const isVirtualId = (id: string) => VIRTUAL_RE.test(id);

export const SERIES_PARENT_LIMIT = 200;

/** วันที่ (ไทย) ของครั้งแรกของงาน */
export function anchorDateOf(r: Pick<TaskRow, 'startAt' | 'dueAt' | 'dueDate'>): string | null {
  if (r.startAt) return bangkokDate(new Date(r.startAt));
  if (r.dueAt) return bangkokDate(new Date(r.dueAt));
  return r.dueDate;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** แถวเสมือนของครั้งที่ date (ยังไม่อยู่ใน DB) */
export function virtualRowFor(parent: TaskRow, date: string): TaskRow {
  const anchor = anchorDateOf(parent)!;
  const days = daysBetween(anchor, date);
  const shift = (s: string | null) =>
    s ? new Date(Date.parse(s) + days * 86_400_000).toISOString() : null;
  return {
    ...parent,
    id: virtualId(parent.id, date),
    parentTaskId: parent.id,
    recurrenceId: date,
    recurrenceRule: null,
    status: 'todo',
    startAt: shift(parent.startAt),
    endAt: shift(parent.endAt),
    dueAt: shift(parent.dueAt),
    dueDate: parent.dueDate ? addDays(parent.dueDate, days) : null,
    completedAt: null,
    gcalEventId: null,
    gcalSyncedAt: null,
  };
}

/** instance เสมือนของซีรีส์ของผู้ใช้ในช่วงวันที่ [fromDate, toDate] (รวมขอบ) ที่ยังไม่มีแถวจริง */
export async function loadSeriesInstances(
  db: Db,
  userIds: string[],
  fromDate: string,
  toDate: string,
): Promise<TaskRow[]> {
  if (!userIds.length) return [];
  const parents = await db
    .select()
    .from(tasks)
    .where(
      and(
        inArray(tasks.userId, userIds),
        isNotNull(tasks.recurrenceRule),
        isNull(tasks.parentTaskId),
      ),
    )
    .limit(SERIES_PARENT_LIMIT);
  if (!parents.length) return [];

  const existing = new Set<string>();
  for (let i = 0; i < parents.length; i += 50) {
    const kids = await db
      .select({ p: tasks.parentTaskId, r: tasks.recurrenceId })
      .from(tasks)
      .where(
        and(
          inArray(
            tasks.parentTaskId,
            parents.slice(i, i + 50).map((p) => p.id),
          ),
          isNotNull(tasks.recurrenceId),
        ),
      );
    for (const k of kids) existing.add(`${k.p}|${k.r}`);
  }

  const out: TaskRow[] = [];
  for (const p of parents) {
    const rule = parseRule(p.recurrenceRule);
    const anchor = anchorDateOf(p);
    if (!rule || !anchor) continue;
    for (const d of occurrences(rule, anchor, fromDate, toDate)) {
      if (!existing.has(`${p.id}|${d}`)) out.push(virtualRowFor(p, d));
    }
  }
  return out;
}

async function getParent(db: Db, userId: string, parentId: string): Promise<TaskRow> {
  const p = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, parentId), eq(tasks.userId, userId)))
    .get();
  if (!p || !p.recurrenceRule || p.parentTaskId)
    throw new ApiError(404, 'not_found', 'ไม่พบงานนี้');
  return p;
}

/** แถวของ id เสมือน (ถ้าเคยสร้างแถวจริงแล้วคืนแถวจริง) — ตรวจว่าวันที่เป็นครั้งที่กฎให้ผลจริง กันสร้างแถวมั่ว */
export async function resolveVirtual(
  db: Db,
  userId: string,
  v: { parentId: string; date: string },
): Promise<TaskRow> {
  const parent = await getParent(db, userId, v.parentId);
  const existing = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.parentTaskId, parent.id),
        eq(tasks.recurrenceId, v.date),
        eq(tasks.userId, userId),
      ),
    )
    .get();
  if (existing) return existing;
  const rule = parseRule(parent.recurrenceRule);
  const anchor = anchorDateOf(parent);
  if (!rule || !anchor || !isOccurrence(rule, anchor, v.date))
    throw new ApiError(404, 'not_found', 'ไม่พบงานนี้');
  return virtualRowFor(parent, v.date);
}

/** สร้างแถวจริงของ instance (ถ้ามีแล้วคืนอันเดิม) คืน id ของแถวจริง */
export async function materialize(
  db: Db,
  userId: string,
  v: { parentId: string; date: string },
): Promise<string> {
  const row = await resolveVirtual(db, userId, v);
  if (!isVirtualId(row.id)) return row.id;
  const parent = await getParent(db, userId, v.parentId);
  const child: TaskRow = {
    ...row,
    id: crypto.randomUUID(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  try {
    await db.insert(tasks).values(child);
  } catch {
    // เรียกพร้อมกัน: อีกคำขอสร้างไปแล้ว (unique index) → ใช้อันนั้น
    const again = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.parentTaskId, parent.id), eq(tasks.recurrenceId, v.date)))
      .get();
    if (again) return again.id;
    throw new ApiError(409, 'conflict', 'สร้างงานของครั้งนี้ไม่สำเร็จ ลองใหม่อีกครั้ง');
  }
  const tags = await db.select().from(taskTags).where(eq(taskTags.taskId, parent.id));
  if (tags.length)
    await db.insert(taskTags).values(tags.map((t) => ({ taskId: child.id, tag: t.tag })));
  await copySubtasks(db, userId, parent.id, child.id);
  return child.id;
}

export async function ensureReal(db: Db, userId: string, id: string): Promise<string> {
  const v = parseVirtualId(id);
  return v ? materialize(db, userId, v) : id;
}

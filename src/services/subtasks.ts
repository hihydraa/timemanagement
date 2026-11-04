import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { subtasks } from '../db/schema';
import { ApiError } from '../lib/http';
import { nowIso } from '../lib/time';

export const MAX_SUBTASKS = 50;
export const subtaskInput = z.object({
  title: z.string().trim().min(1, 'กรุณาระบุชื่อรายการย่อย').max(200),
});
export const subtaskPatch = z
  .object({ title: z.string().trim().min(1).max(200), done: z.boolean() })
  .partial()
  .strict();

export type SubtaskRow = typeof subtasks.$inferSelect;
export interface SubtaskDto {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  sortOrder: number;
}
const toDto = (r: SubtaskRow): SubtaskDto => ({
  id: r.id,
  taskId: r.taskId,
  title: r.title,
  done: r.done === 1,
  sortOrder: r.sortOrder,
});

export async function listSubtasks(db: Db, userId: string, taskId: string): Promise<SubtaskDto[]> {
  const rows = await db
    .select()
    .from(subtasks)
    .where(and(eq(subtasks.taskId, taskId), eq(subtasks.userId, userId)))
    .orderBy(asc(subtasks.sortOrder), asc(subtasks.createdAt));
  return rows.map(toDto);
}

export async function addSubtask(
  db: Db,
  userId: string,
  taskId: string,
  title: string,
): Promise<SubtaskDto> {
  const cur = await db
    .select({ n: sql<number>`count(*)`, max: sql<number>`coalesce(max(${subtasks.sortOrder}), 0)` })
    .from(subtasks)
    .where(and(eq(subtasks.taskId, taskId), eq(subtasks.userId, userId)))
    .get();
  if (Number(cur?.n ?? 0) >= MAX_SUBTASKS) {
    throw new ApiError(
      400,
      'too_many_subtasks',
      `เพิ่มรายการย่อยได้ไม่เกิน ${MAX_SUBTASKS} รายการต่องาน`,
    );
  }
  const row: SubtaskRow = {
    id: crypto.randomUUID(),
    taskId,
    userId,
    title,
    done: 0,
    sortOrder: Number(cur?.max ?? 0) + 1,
    createdAt: nowIso(),
  };
  await db.insert(subtasks).values(row);
  return toDto(row);
}

async function getOwnedSub(db: Db, userId: string, id: string): Promise<SubtaskRow> {
  const row = await db
    .select()
    .from(subtasks)
    .where(and(eq(subtasks.id, id), eq(subtasks.userId, userId)))
    .get();
  if (!row) throw new ApiError(404, 'not_found', 'ไม่พบรายการย่อยนี้');
  return row;
}

export async function updateSubtask(
  db: Db,
  userId: string,
  id: string,
  patch: z.infer<typeof subtaskPatch>,
): Promise<SubtaskDto> {
  const cur = await getOwnedSub(db, userId, id);
  const set: Partial<SubtaskRow> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.done !== undefined) set.done = patch.done ? 1 : 0;
  if (Object.keys(set).length) {
    await db
      .update(subtasks)
      .set(set)
      .where(and(eq(subtasks.id, id), eq(subtasks.userId, userId)));
  }
  return toDto({ ...cur, ...set });
}

export async function deleteSubtask(db: Db, userId: string, id: string): Promise<void> {
  await getOwnedSub(db, userId, id);
  await db.delete(subtasks).where(and(eq(subtasks.id, id), eq(subtasks.userId, userId)));
}

export async function deleteSubtasksOf(db: Db, taskIds: string[]): Promise<void> {
  for (let i = 0; i < taskIds.length; i += 50) {
    await db.delete(subtasks).where(inArray(subtasks.taskId, taskIds.slice(i, i + 50)));
  }
}

export async function subtaskCounts(
  db: Db,
  taskIds: string[],
): Promise<Map<string, { total: number; done: number }>> {
  const out = new Map<string, { total: number; done: number }>();
  const ids = [...new Set(taskIds)];
  for (let i = 0; i < ids.length; i += 50) {
    const rows = await db
      .select({
        taskId: subtasks.taskId,
        total: sql<number>`count(*)`,
        done: sql<number>`coalesce(sum(${subtasks.done}), 0)`,
      })
      .from(subtasks)
      .where(inArray(subtasks.taskId, ids.slice(i, i + 50)))
      .groupBy(subtasks.taskId);
    for (const r of rows) out.set(r.taskId, { total: Number(r.total), done: Number(r.done) });
  }
  return out;
}

/** คัดลอกรายการย่อยของงานแม่ไปงานของครั้งใหม่ (ยังไม่ทำ) */
export async function copySubtasks(
  db: Db,
  userId: string,
  fromTaskId: string,
  toTaskId: string,
): Promise<void> {
  const rows = await listSubtasks(db, userId, fromTaskId);
  if (!rows.length) return;
  await db.insert(subtasks).values(
    rows.map((r) => ({
      id: crypto.randomUUID(),
      taskId: toTaskId,
      userId,
      title: r.title,
      done: 0,
      sortOrder: r.sortOrder,
      createdAt: nowIso(),
    })),
  );
}

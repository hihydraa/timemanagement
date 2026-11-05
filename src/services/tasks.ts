import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { categories, taskTags, tasks } from '../db/schema';
import { ApiError } from '../lib/http';
import { computeUrgency } from '../lib/urgency';
import { countsByTask, deleteTaskFiles } from './attachments';
import { deleteSubtasksOf, subtaskCounts } from './subtasks';
import {
  ensureReal,
  isVirtualId,
  loadSeriesInstances,
  parseVirtualId,
  resolveVirtual,
} from './series';
import { addDays, bangkokDate, fromBangkok, now, nowIso } from '../lib/time';

type TaskRow = typeof tasks.$inferSelect;
export interface TaskDto extends Omit<TaskRow, 'allDay' | 'gcalSync'> {
  allDay: boolean;
  gcalSync: boolean;
  tags: string[];
  attachmentCount: number;
  subtaskTotal: number;
  subtaskDone: number;
}

const iso = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s).toISOString());
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ต้องเป็นรูปแบบ YYYY-MM-DD');
const level = z.number().int().min(1).max(4);
const tagSchema = z.string().trim().min(1).max(30);

export const taskInput = z.object({
  title: z.string().trim().min(1, 'กรุณาระบุชื่องาน').max(200),
  description: z.string().max(5000).default(''),
  categoryId: z.string().nullable().default(null),
  urgency: level.default(2),
  importance: level.default(2),
  status: z.enum(['todo', 'doing', 'done', 'cancelled']).default('todo'),
  allDay: z.boolean().default(false),
  startAt: iso.nullable().default(null),
  endAt: iso.nullable().default(null),
  dueAt: iso.nullable().default(null),
  dueDate: ymd.nullable().default(null),
  estimateMinutes: z
    .number()
    .int()
    .min(1)
    .max(60 * 24)
    .nullable()
    .default(null),
  recurrenceRule: z
    .string()
    .regex(
      /^FREQ=(DAILY|WEEKLY|MONTHLY)(;INTERVAL=\d{1,2})?(;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*)?(;UNTIL=\d{8})?$/,
      'รูปแบบการทำซ้ำไม่ถูกต้อง',
    )
    .nullable()
    .default(null),
  tags: z.array(tagSchema).max(20).default([]),
  source: z.enum(['web', 'line']).default('web'),
  gcalSync: z.boolean().default(true),
});
export const taskPatch = taskInput.partial();
export type TaskInput = z.infer<typeof taskInput>;

/** ทำให้ข้อมูลเวลาสอดคล้องกัน: all-day ใช้ dueDate, งานมีเวลาใช้ startAt/endAt/dueAt */
export function normalizeTime<
  T extends Pick<TaskInput, 'allDay' | 'startAt' | 'endAt' | 'dueAt' | 'dueDate'>,
>(t: T): T {
  if (t.allDay) {
    if (!t.dueDate)
      throw new ApiError(400, 'validation_error', 'dueDate: งานทั้งวันต้องระบุวันที่');
    return { ...t, startAt: null, endAt: null, dueAt: null };
  }
  if (t.startAt && t.endAt && t.endAt < t.startAt) {
    throw new ApiError(400, 'validation_error', 'endAt: เวลาสิ้นสุดต้องไม่ก่อนเวลาเริ่ม');
  }
  return { ...t, dueDate: null };
}

function chunk<T>(a: T[], n = 50): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

export async function withTags(db: Db, rows: TaskRow[]): Promise<TaskDto[]> {
  // instance เสมือนใช้แท็ก/รายการย่อยของงานแม่
  const key = (r: TaskRow) => parseVirtualId(r.id)?.parentId ?? r.id;
  const keys = [...new Set(rows.map(key))];
  const byTask = new Map<string, string[]>();
  for (const ids of chunk(keys)) {
    const tg = await db.select().from(taskTags).where(inArray(taskTags.taskId, ids));
    for (const t of tg) byTask.set(t.taskId, [...(byTask.get(t.taskId) ?? []), t.tag]);
  }
  const real = rows.filter((r) => !isVirtualId(r.id)).map((r) => r.id);
  const counts = await countsByTask(db, real);
  const subs = await subtaskCounts(db, keys);
  const at = now();
  return rows.map((r) => ({
    ...r,
    // คำนวณจากวันที่ทุกครั้ง (ไม่ใช้ค่าที่เก็บไว้): ดู lib/urgency.ts
    urgency: computeUrgency(r, at),
    allDay: r.allDay === 1,
    gcalSync: r.gcalSync === 1,
    tags: (byTask.get(key(r)) ?? []).sort(),
    attachmentCount: counts.get(r.id) ?? 0,
    subtaskTotal: subs.get(key(r))?.total ?? 0,
    subtaskDone: subs.get(key(r))?.done ?? 0,
  }));
}

export async function assertCategoryOwned(db: Db, userId: string, categoryId: string | null) {
  if (!categoryId) return;
  const c = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .get();
  if (!c) throw new ApiError(400, 'validation_error', 'categoryId: ไม่พบประเภทงานนี้');
}

async function replaceTags(db: Db, taskId: string, tags: string[]) {
  await db.delete(taskTags).where(eq(taskTags.taskId, taskId));
  const unique = [...new Set(tags)];
  if (unique.length) await db.insert(taskTags).values(unique.map((tag) => ({ taskId, tag })));
}

export async function getOwned(db: Db, userId: string, id: string): Promise<TaskRow> {
  const v = parseVirtualId(id);
  if (v) return resolveVirtual(db, userId, v); // instance ของงานทำซ้ำ (เสมือน หรือแถวจริงถ้าเคยสร้างแล้ว)
  const row = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .get();
  if (!row) throw new ApiError(404, 'not_found', 'ไม่พบงานนี้');
  return row;
}

export const DEFAULT_MAX_TASKS_PER_USER = 3000;
export const taskLimit = (env: { MAX_TASKS_PER_USER?: string }): number => {
  const n = Number(env.MAX_TASKS_PER_USER);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_TASKS_PER_USER;
};

/** maxTasks = เพดานจำนวนงานต่อผู้ใช้ (กันบัญชีเดียวกินโควตา D1 ฟรีของทั้งระบบ) */
export async function createTask(
  db: Db,
  userId: string,
  input: TaskInput,
  maxTasks: number = DEFAULT_MAX_TASKS_PER_USER,
): Promise<TaskDto> {
  const count = await db
    .select({ n: sql<number>`count(*)` })
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .get();
  if (Number(count?.n ?? 0) >= maxTasks)
    throw new ApiError(
      409,
      'task_limit',
      `จำนวนงานเต็มเพดาน (${maxTasks} งาน) ลองลบงานเก่าที่ไม่ใช้แล้วก่อน`,
    );
  const t = normalizeTime(input);
  await assertCategoryOwned(db, userId, t.categoryId);
  const ts = nowIso();
  const id = crypto.randomUUID();
  await db.insert(tasks).values({
    id,
    userId,
    title: t.title,
    description: t.description,
    categoryId: t.categoryId,
    urgency: t.urgency,
    importance: t.importance,
    status: t.status,
    allDay: t.allDay ? 1 : 0,
    startAt: t.startAt,
    endAt: t.endAt,
    dueAt: t.dueAt,
    dueDate: t.dueDate,
    estimateMinutes: t.estimateMinutes,
    recurrenceRule: t.recurrenceRule,
    gcalSync: t.gcalSync ? 1 : 0,
    source: t.source,
    completedAt: t.status === 'done' ? ts : null,
    createdAt: ts,
    updatedAt: ts,
  });
  await replaceTags(db, id, t.tags);
  return (await withTags(db, [await getOwned(db, userId, id)]))[0]!;
}

export async function updateTask(
  db: Db,
  userId: string,
  id: string,
  patch: z.infer<typeof taskPatch>,
): Promise<TaskDto> {
  id = await ensureReal(db, userId, id); // แก้ instance เสมือน = สร้างแถวจริงของครั้งนั้นก่อน
  const cur = await getOwned(db, userId, id);
  if (cur.parentTaskId && patch.recurrenceRule) {
    throw new ApiError(
      400,
      'validation_error',
      'recurrenceRule: ตั้งการทำซ้ำได้เฉพาะงานแม่ของซีรีส์',
    );
  }
  const merged = normalizeTime({
    allDay: patch.allDay ?? cur.allDay === 1,
    startAt: patch.startAt !== undefined ? patch.startAt : cur.startAt,
    endAt: patch.endAt !== undefined ? patch.endAt : cur.endAt,
    dueAt: patch.dueAt !== undefined ? patch.dueAt : cur.dueAt,
    dueDate: patch.dueDate !== undefined ? patch.dueDate : cur.dueDate,
  });
  if (patch.categoryId !== undefined) await assertCategoryOwned(db, userId, patch.categoryId);
  const ts = nowIso();
  const status = patch.status ?? cur.status;
  await db
    .update(tasks)
    .set({
      title: patch.title ?? cur.title,
      description: patch.description ?? cur.description,
      categoryId: patch.categoryId !== undefined ? patch.categoryId : cur.categoryId,
      urgency: patch.urgency ?? cur.urgency,
      importance: patch.importance ?? cur.importance,
      status,
      allDay: merged.allDay ? 1 : 0,
      startAt: merged.startAt,
      endAt: merged.endAt,
      dueAt: merged.dueAt,
      dueDate: merged.dueDate,
      estimateMinutes:
        patch.estimateMinutes !== undefined ? patch.estimateMinutes : cur.estimateMinutes,
      recurrenceRule:
        patch.recurrenceRule !== undefined ? patch.recurrenceRule : cur.recurrenceRule,
      gcalSync: patch.gcalSync !== undefined ? (patch.gcalSync ? 1 : 0) : cur.gcalSync,
      completedAt: status === 'done' ? (cur.completedAt ?? ts) : null,
      updatedAt: ts,
    })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  if (patch.tags) await replaceTags(db, id, patch.tags);
  return (await withTags(db, [await getOwned(db, userId, id)]))[0]!;
}

export interface DeleteResult {
  /** event บน Google Calendar ที่ต้องลบ */
  gcalEventIds: string[];
  /** ลบแค่ "ครั้งนี้" ของงานทำซ้ำ = ทำเครื่องหมายยกเลิก (แถวยังอยู่เพื่อไม่ให้ instance เสมือนกลับมา) ให้ซิงก์แถวนี้แทน */
  tombstoneId: string | null;
}

/**
 * ลบงาน
 * - งานปกติ: ลบจริง
 * - งานทำซ้ำ scope=one (ค่าเริ่มต้น): ยกเลิกเฉพาะครั้งนี้ (tombstone)
 * - งานทำซ้ำ scope=series: ลบทั้งซีรีส์ (แม่ + ทุกครั้งที่สร้างแถวจริงไว้)
 */
export async function deleteTask(
  db: Db,
  bucket: R2Bucket,
  userId: string,
  id: string,
  scope: 'one' | 'series' = 'one',
): Promise<DeleteResult> {
  const row = await getOwned(db, userId, id);
  const inSeries = !!row.recurrenceRule || (!!row.parentTaskId && !!row.recurrenceId);

  if (inSeries && scope === 'one') {
    const realId = await ensureReal(db, userId, id);
    await db
      .update(tasks)
      .set({ status: 'cancelled', completedAt: null, updatedAt: nowIso() })
      .where(and(eq(tasks.id, realId), eq(tasks.userId, userId)));
    return { gcalEventIds: [], tombstoneId: realId };
  }

  const ids: string[] = [];
  const events: string[] = [];
  if (inSeries) {
    const parentId = row.recurrenceRule ? row.id : row.parentTaskId!;
    const all = await db
      .select({ id: tasks.id, ev: tasks.gcalEventId })
      .from(tasks)
      .where(
        and(eq(tasks.userId, userId), or(eq(tasks.id, parentId), eq(tasks.parentTaskId, parentId))),
      );
    for (const r of all) {
      ids.push(r.id);
      if (r.ev) events.push(r.ev);
    }
  } else {
    ids.push(row.id);
    if (row.gcalEventId) events.push(row.gcalEventId);
  }
  for (const tid of ids) {
    await deleteTaskFiles(db, bucket, userId, tid);
    await db.delete(taskTags).where(eq(taskTags.taskId, tid));
  }
  await deleteSubtasksOf(db, ids);
  for (let i = 0; i < ids.length; i += 50) {
    await db
      .delete(tasks)
      .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids.slice(i, i + 50))));
  }
  return { gcalEventIds: events, tombstoneId: null };
}

export const listQuery = z.object({
  from: iso.optional(),
  to: iso.optional(),
  status: z.enum(['todo', 'doing', 'done', 'cancelled']).optional(),
  category: z.string().optional(),
  q: z.string().max(100).optional(),
  tag: z.string().max(30).optional(),
});

export async function listTasks(
  db: Db,
  userId: string,
  q: z.infer<typeof listQuery>,
): Promise<TaskDto[]> {
  const conds = [eq(tasks.userId, userId)];
  if (q.status) conds.push(eq(tasks.status, q.status));
  if (q.category) conds.push(eq(tasks.categoryId, q.category));
  if (q.q) conds.push(like(tasks.title, `%${q.q}%`));
  if (q.tag) {
    conds.push(
      sql`${tasks.id} in (select ${taskTags.taskId} from ${taskTags} where ${taskTags.tag} = ${q.tag})`,
    );
  }
  if (q.from && q.to) {
    const fromDate = bangkokDate(new Date(q.from));
    const toDate = bangkokDate(new Date(q.to));
    conds.push(
      or(
        and(
          isNotNull(tasks.startAt),
          lt(tasks.startAt, q.to),
          sql`coalesce(${tasks.endAt}, ${tasks.startAt}) >= ${q.from}`,
        ),
        and(isNull(tasks.startAt), gte(tasks.dueAt, q.from), lt(tasks.dueAt, q.to)),
        and(isNotNull(tasks.dueDate), gte(tasks.dueDate, fromDate), lt(tasks.dueDate, toDate)),
      )!,
    );
  }
  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conds))
    .orderBy(asc(tasks.startAt), asc(tasks.dueAt), desc(tasks.createdAt))
    .limit(500);
  const real = await withTags(db, rows);
  if (!(q.from && q.to)) return real;

  // งานทำซ้ำ: ขยายเป็น instance เสมือนในช่วงที่ขอ (ที่ยังไม่มีแถวจริง)
  const fromDate = bangkokDate(new Date(q.from));
  const toDate = bangkokDate(new Date(new Date(q.to).getTime() - 1));
  const from = q.from;
  const to = q.to;
  const inRange = (r: TaskRow) =>
    r.startAt
      ? r.startAt < to && (r.endAt ?? r.startAt) >= from
      : r.dueAt
        ? r.dueAt >= from && r.dueAt < to
        : !!r.dueDate && r.dueDate >= fromDate && r.dueDate < bangkokDate(new Date(to));
  const virt = (await loadSeriesInstances(db, [userId], fromDate, toDate)).filter(inRange);
  const needle = q.q?.toLowerCase();
  const extra = (await withTags(db, virt)).filter(
    (t) =>
      (!q.status || q.status === 'todo') &&
      (!q.category || t.categoryId === q.category) &&
      (!needle || t.title.toLowerCase().includes(needle)) &&
      (!q.tag || t.tags.includes(q.tag)),
  );
  return [...real, ...extra];
}

const OPEN = ['todo', 'doing'] as const;
const score = (t: TaskDto) => t.urgency * 2 + t.importance * 2;
const timeKey = (t: TaskDto) => t.startAt ?? t.dueAt ?? t.dueDate ?? '';
const bySmart = (a: TaskDto, b: TaskDto) =>
  timeKey(a).localeCompare(timeKey(b)) || score(b) - score(a);

export async function todayBuckets(db: Db, userId: string, at: Date) {
  const today = bangkokDate(at);
  const start = fromBangkok(today).toISOString();
  const end = fromBangkok(addDays(today, 1)).toISOString();
  const nowStr = at.toISOString();

  const rows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        inArray(tasks.status, [...OPEN]),
        or(
          lt(tasks.dueAt, end),
          lt(tasks.dueDate, addDays(today, 1)),
          and(gte(tasks.startAt, start), lt(tasks.startAt, end)),
        ),
      ),
    )
    .limit(500);
  const all = await withTags(db, rows);
  // วันนี้ของงานทำซ้ำ (instance เสมือน) นับเป็นงานวันนี้ด้วย
  all.push(...(await withTags(db, await loadSeriesInstances(db, [userId], today, today))));

  const seen = new Set<string>();
  const take = (pred: (t: TaskDto) => boolean) => {
    const out = all.filter((t) => !seen.has(t.id) && pred(t));
    out.forEach((t) => seen.add(t.id));
    return out;
  };
  const overdue = take(
    (t) => (!!t.dueAt && t.dueAt < nowStr) || (!!t.dueDate && t.dueDate < today),
  );
  const dueToday = take((t) => !!t.dueAt && t.dueAt >= start && t.dueAt < end);
  const todayList = take(
    (t) => t.dueDate === today || (!!t.startAt && t.startAt >= start && t.startAt < end),
  );
  return {
    date: today,
    overdue: overdue.sort(bySmart),
    dueToday: dueToday.sort(bySmart),
    today: todayList.sort(bySmart),
  };
}

export async function inboxTasks(db: Db, userId: string): Promise<TaskDto[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        inArray(tasks.status, [...OPEN]),
        isNull(tasks.startAt),
        isNull(tasks.dueAt),
        isNull(tasks.dueDate),
      ),
    )
    .orderBy(desc(tasks.createdAt))
    .limit(200);
  return withTags(db, rows);
}

/** เลื่อนงานตามจำนวนนาที/วัน (ใช้ร่วมกันระหว่างเว็บและ LINE) */
export async function snoozeTask(
  db: Db,
  userId: string,
  id: string,
  by: { minutes?: number; days?: number },
): Promise<TaskDto> {
  const t = await getOwned(db, userId, id);
  if (!t.startAt && !t.dueAt && !t.dueDate) {
    throw new ApiError(400, 'validation_error', 'งานนี้ยังไม่มีกำหนดเวลา');
  }
  const shiftMs = by.minutes ? by.minutes * 60_000 : (by.days ?? 1) * 86_400_000;
  const shift = (s: string | null) =>
    s ? new Date(new Date(s).getTime() + shiftMs).toISOString() : null;
  const moved = await updateTask(db, userId, t.id, {
    startAt: shift(t.startAt),
    endAt: shift(t.endAt),
    dueAt: shift(t.dueAt),
    dueDate: t.dueDate
      ? addDays(t.dueDate, by.days ?? Math.max(1, Math.round(shiftMs / 86_400_000)))
      : null,
    status: 'todo',
  });
  await db
    .update(tasks)
    .set({ snoozeCount: sql`${tasks.snoozeCount} + 1` })
    .where(and(eq(tasks.id, t.id), eq(tasks.userId, userId)));
  return { ...moved, snoozeCount: t.snoozeCount + 1 };
}

/** งานที่ยังไม่เสร็จของผู้ใช้ (ใช้ค้นหาตามชื่อจาก LINE) */
export async function openTasks(db: Db, userId: string): Promise<TaskDto[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), inArray(tasks.status, ['todo', 'doing'])))
    .orderBy(desc(tasks.createdAt))
    .limit(300);
  return withTags(db, rows);
}

export const CARRY_MAX = 15;

/**
 * เลื่อนงานที่ยังไม่เสร็จของ "วัน date" ไปวันถัดไป (+1 วัน) ด้วยคำสั่ง UPDATE เดียว
 * (งานของวันนั้น = เริ่ม/เดดไลน์ภายในวันนั้น หรือเป็นงานทั้งวันของวันนั้น)
 * คืน id ที่เลื่อน และ hasMore (ยังมีเหลือเกินเพดาน CARRY_MAX ต่อครั้ง) — เรียกซ้ำปลอดภัย: งานที่เลื่อนแล้วไม่ตรงเงื่อนไขอีก
 */
export async function carryOver(
  db: Db,
  userId: string,
  date: string,
): Promise<{ movedIds: string[]; hasMore: boolean }> {
  const start = fromBangkok(date).toISOString();
  const end = fromBangkok(addDays(date, 1)).toISOString();
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        inArray(tasks.status, ['todo', 'doing']),
        // งานทำซ้ำไม่เลื่อนด้วยปุ่มนี้ (การเลื่อนแม่จะย้ายทั้งซีรีส์)
        isNull(tasks.recurrenceRule),
        isNull(tasks.parentTaskId),
        or(
          and(gte(tasks.startAt, start), lt(tasks.startAt, end)),
          and(isNull(tasks.startAt), gte(tasks.dueAt, start), lt(tasks.dueAt, end)),
          eq(tasks.dueDate, date),
        ),
      ),
    )
    .orderBy(desc(sql`${tasks.urgency} * ${tasks.importance}`), asc(tasks.id))
    .limit(CARRY_MAX + 1);
  const ids = rows.slice(0, CARRY_MAX).map((r) => r.id);
  if (!ids.length) return { movedIds: [], hasMore: false };
  const shift = (col: unknown) =>
    sql`case when ${col} is null then null else strftime('%Y-%m-%dT%H:%M:%fZ', ${col}, '+1 day') end`;
  await db
    .update(tasks)
    .set({
      startAt: shift(tasks.startAt),
      endAt: shift(tasks.endAt),
      dueAt: shift(tasks.dueAt),
      dueDate: sql`case when ${tasks.dueDate} is null then null else date(${tasks.dueDate}, '+1 day') end`,
      snoozeCount: sql`${tasks.snoozeCount} + 1`,
      updatedAt: nowIso(),
    })
    .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids)));
  return { movedIds: ids, hasMore: rows.length > CARRY_MAX };
}

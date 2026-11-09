import { eq, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { z } from 'zod';
import type { Db } from '../db/client';
import { taskTags, tasks } from '../db/schema';
import { ApiError } from '../lib/http';
import { nowIso } from '../lib/time';

export const MAX_IMPORT = 500;
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** งานที่นำเข้า (แปลงจากไฟล์ฝั่งหน้าเว็บแล้ว): ไม่ซิงก์ Google, ไม่ส่งแจ้งเตือน */
export const importInput = z
  .object({
    tasks: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            description: z.string().max(5000).default(''),
            status: z.enum(['todo', 'doing', 'done', 'cancelled']).default('todo'),
            dueDate: ymd.nullable().default(null),
            completedAt: z.string().datetime().nullable().default(null),
            tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_IMPORT),
  })
  .strict();

export interface ImportResult {
  imported: number;
  skipped: number;
}

/**
 * นำเข้างานเป็นชุด (db.batch เป็นก้อน ๆ — ไม่ยิงทีละงาน เพราะเพดาน subrequest ของ Workers ฟรี)
 * งานที่ชื่อ + วันครบกำหนด + สถานะ ตรงกับที่มีอยู่แล้วของผู้ใช้จะถูกข้าม (นำเข้าซ้ำได้ ไม่เบิ้ล)
 */
export async function importTasks(
  db: Db,
  userId: string,
  input: z.infer<typeof importInput>,
  maxTasks: number,
): Promise<ImportResult> {
  const existing = await db
    .select({ t: tasks.title, d: tasks.dueDate, s: tasks.status })
    .from(tasks)
    .where(eq(tasks.userId, userId));
  const seen = new Set(existing.map((e) => `${e.t}|${e.d ?? ''}|${e.s}`));
  const fresh = input.tasks.filter((t) => {
    const k = `${t.title}|${t.dueDate ?? ''}|${t.status}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const total = await db
    .select({ n: sql<number>`count(*)` })
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .get();
  if (Number(total?.n ?? 0) + fresh.length > maxTasks)
    throw new ApiError(409, 'task_limit', `จำนวนงานจะเกินเพดาน (${maxTasks} งาน)`);

  const ts = nowIso();
  const stmts: BatchItem<'sqlite'>[] = [];
  for (const t of fresh) {
    const id = crypto.randomUUID();
    stmts.push(
      db.insert(tasks).values({
        id,
        userId,
        title: t.title,
        description: t.description,
        status: t.status,
        allDay: t.dueDate ? 1 : 0,
        dueDate: t.dueDate,
        gcalSync: 0,
        source: 'web',
        completedAt: t.status === 'done' ? (t.completedAt ?? ts) : null,
        createdAt: ts,
        updatedAt: ts,
      }),
    );
    for (const tag of new Set(t.tags))
      stmts.push(db.insert(taskTags).values({ taskId: id, tag }).onConflictDoNothing() as never);
  }
  for (let i = 0; i < stmts.length; i += 90) {
    const chunk = stmts.slice(i, i + 90);
    await db.batch(chunk as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  }
  return { imported: fresh.length, skipped: input.tasks.length - fresh.length };
}

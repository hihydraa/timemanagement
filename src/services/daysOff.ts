import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { daysOff, userSettings } from '../db/schema';
import { DAY_OFF_KINDS, isYmd, type DayOffKind } from '../lib/daysOff';
import { ApiError } from '../lib/http';
import { addDays, nowIso } from '../lib/time';
import { parseWorkDays } from '../lib/work';

export { DAY_OFF_KINDS, type DayOffKind };

/** ช่วงที่บันทึกต่อครั้งได้ไม่เกินกี่วัน และช่วงที่ดึงรายการได้ไม่เกินกี่วัน */
export const MAX_RANGE_DAYS = 90;
export const MAX_LIST_DAYS = 800;

const ymd = z.string().refine(isYmd, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD และเป็นวันจริง');
const note = z.string().trim().max(200, 'โน้ตยาวสุด 200 ตัวอักษร');

export const addInput = z
  .object({
    from: ymd,
    /** ไม่ส่ง = วันเดียว */
    to: ymd.optional(),
    kind: z.enum(DAY_OFF_KINDS).default('vacation'),
    note: note.default(''),
    /** ช่วงหลายวัน: ข้ามวันที่ไม่ใช่วันทำงาน (เช่น เสาร์-อาทิตย์) — วันเดียวบันทึกเสมอ */
    onlyWorkDays: z.boolean().default(true),
  })
  .strict();

export const patchInput = z
  .object({ kind: z.enum(DAY_OFF_KINDS).optional(), note: note.optional() })
  .strict()
  .refine((v) => v.kind !== undefined || v.note !== undefined, 'ไม่มีอะไรให้แก้');

export const listQuery = z.object({ from: ymd.optional(), to: ymd.optional() });

const dayDiff = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const isoWeekday = (d: string): number => {
  const w = new Date(`${d}T00:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
};

export interface DayOffDto {
  id: string;
  date: string;
  kind: DayOffKind;
  note: string;
}
const toDto = (r: typeof daysOff.$inferSelect): DayOffDto => ({
  id: r.id,
  date: r.date,
  kind: r.kind,
  note: r.note,
});

export function summarize(list: DayOffDto[]) {
  const byKind = Object.fromEntries(DAY_OFF_KINDS.map((k) => [k, 0])) as Record<DayOffKind, number>;
  for (const d of list) byKind[d.kind]++;
  return { total: list.length, byKind };
}

/** รายการวันหยุดในช่วง from–to (รวมปลายทั้งสอง) เรียงตามวัน */
export async function listDaysOff(db: Db, userId: string, from: string, to: string) {
  if (to < from) throw new ApiError(400, 'validation_error', 'to: ต้องไม่ก่อน from');
  if (dayDiff(from, to) > MAX_LIST_DAYS)
    throw new ApiError(400, 'validation_error', `ดึงรายการได้ไม่เกิน ${MAX_LIST_DAYS} วันต่อครั้ง`);
  const rows = await db
    .select()
    .from(daysOff)
    .where(and(eq(daysOff.userId, userId), gte(daysOff.date, from), lte(daysOff.date, to)))
    .orderBy(asc(daysOff.date));
  const list = rows.map(toDto);
  return { daysOff: list, summary: summarize(list) };
}

/** วันที่หยุดในช่วง (ใช้คำนวณภาระงาน: วันหยุด = ไม่นับเป็นวันทำงาน) */
export async function daysOffBetween(
  db: Db,
  userId: string,
  from: string,
  to: string,
): Promise<string[]> {
  const rows = await db
    .select({ d: daysOff.date })
    .from(daysOff)
    .where(and(eq(daysOff.userId, userId), gte(daysOff.date, from), lte(daysOff.date, to)));
  return rows.map((r) => r.d).sort();
}

export async function addDaysOff(db: Db, userId: string, input: z.infer<typeof addInput>) {
  const to = input.to ?? input.from;
  if (to < input.from) throw new ApiError(400, 'validation_error', 'to: ต้องไม่ก่อน from');
  const span = dayDiff(input.from, to) + 1;
  if (span > MAX_RANGE_DAYS)
    throw new ApiError(
      400,
      'validation_error',
      `บันทึกช่วงได้ไม่เกิน ${MAX_RANGE_DAYS} วันต่อครั้ง`,
    );
  let dates = Array.from({ length: span }, (_, i) => addDays(input.from, i));
  if (span > 1 && input.onlyWorkDays) {
    const s = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
    const work = parseWorkDays(s?.workDays);
    dates = dates.filter((d) => work.includes(isoWeekday(d)));
    if (dates.length === 0)
      throw new ApiError(
        400,
        'no_work_days',
        'ในช่วงนี้ไม่มีวันทำงาน (ลองปิด "ข้ามวันที่ไม่ใช่วันทำงาน")',
      );
  }
  const existing = new Set(
    (
      await db
        .select({ d: daysOff.date })
        .from(daysOff)
        .where(
          and(eq(daysOff.userId, userId), gte(daysOff.date, input.from), lte(daysOff.date, to)),
        )
    ).map((r) => r.d),
  );
  const ts = nowIso();
  const stmts = dates.map((date) =>
    db
      .insert(daysOff)
      .values({
        id: crypto.randomUUID(),
        userId,
        date,
        kind: input.kind,
        note: input.note,
        createdAt: ts,
      })
      // บันทึกซ้ำวันเดิม = แก้ประเภท/โน้ตของวันนั้น (1 วันมีได้รายการเดียว)
      .onConflictDoUpdate({
        target: [daysOff.userId, daysOff.date],
        set: { kind: input.kind, note: input.note },
      }),
  );
  for (let i = 0; i < stmts.length; i += 50)
    await db.batch(stmts.slice(i, i + 50) as unknown as [(typeof stmts)[0], ...typeof stmts]);
  const created = dates.filter((d) => !existing.has(d)).length;
  return { dates, created, updated: dates.length - created };
}

async function getOwnedDay(db: Db, userId: string, id: string) {
  const r = await db
    .select()
    .from(daysOff)
    .where(and(eq(daysOff.id, id), eq(daysOff.userId, userId)))
    .get();
  if (!r) throw new ApiError(404, 'not_found', 'ไม่พบวันหยุดนี้');
  return r;
}

export async function patchDayOff(
  db: Db,
  userId: string,
  id: string,
  patch: z.infer<typeof patchInput>,
) {
  await getOwnedDay(db, userId, id);
  const set: Partial<typeof daysOff.$inferInsert> = {};
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.note !== undefined) set.note = patch.note;
  await db
    .update(daysOff)
    .set(set)
    .where(and(eq(daysOff.id, id), eq(daysOff.userId, userId)));
  return toDto(await getOwnedDay(db, userId, id));
}

export async function deleteDayOff(db: Db, userId: string, id: string) {
  await getOwnedDay(db, userId, id);
  await db.delete(daysOff).where(and(eq(daysOff.id, id), eq(daysOff.userId, userId)));
}

/** ภาพรวมวันหยุดสำหรับแดชบอร์ด: วันนี้หยุดไหม, สรุปปีนี้, 5 วันหยุดถัดไป (60 วัน), วันหยุดของเดือนที่แสดงอยู่ */
export async function leaveOverview(
  db: Db,
  userId: string,
  today: string,
  monthStart: string,
  monthEnd: string,
) {
  const year = today.slice(0, 4);
  const [yearly, upcoming, month] = await Promise.all([
    listDaysOff(db, userId, `${year}-01-01`, `${year}-12-31`),
    listDaysOff(db, userId, today, addDays(today, 60)),
    listDaysOff(db, userId, monthStart, monthEnd),
  ]);
  return {
    year: Number(year),
    today: yearly.daysOff.find((d) => d.date === today) ?? null,
    summary: yearly.summary,
    upcoming: upcoming.daysOff.slice(0, 5),
    month: month.daysOff,
  };
}

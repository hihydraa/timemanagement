import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  attachments,
  categories,
  focusSessions,
  subtasks,
  taskTags,
  tasks,
  users,
} from '../db/schema';
import { bangkokDate, bangkokHm, nowIso, toBangkokIso } from '../lib/time';

type TaskRow = typeof tasks.$inferSelect;

export interface ExportData {
  exportedAt: string;
  user: { email: string; name: string };
  categories: { id: string; name: string; color: string }[];
  tasks: (Omit<TaskRow, 'userId' | 'gcalEventId' | 'gcalSyncedAt'> & {
    tags: string[];
    subtasks: { title: string; done: boolean }[];
    attachments: { filename: string; mime: string; sizeBytes: number }[];
  })[];
  focusSessions: {
    taskId: string | null;
    startedAt: string;
    endedAt: string | null;
    minutes: number;
  }[];
}

/** ข้อมูลทั้งหมดของผู้ใช้ (ไม่รวม token/รหัสผูก LINE/ไฟล์จริง — ไฟล์แนบส่งเฉพาะข้อมูลไฟล์) */
export async function gatherExport(db: Db, userId: string): Promise<ExportData> {
  const [u] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId));
  const cats = await db.select().from(categories).where(eq(categories.userId, userId));
  const rows = await db.select().from(tasks).where(eq(tasks.userId, userId)).limit(20_000);
  const ids = new Set(rows.map((r) => r.id));
  const tagRows = (await db.select().from(taskTags)).filter((t) => ids.has(t.taskId)); // เฉพาะของงานเรา
  const subRows = await db.select().from(subtasks).where(eq(subtasks.userId, userId));
  const attRows = await db.select().from(attachments).where(eq(attachments.userId, userId));
  const fs = await db
    .select()
    .from(focusSessions)
    .where(eq(focusSessions.userId, userId))
    .limit(20_000);

  const group = <T extends { taskId: string }>(xs: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(x.taskId, [...(m.get(x.taskId) ?? []), x]);
    return m;
  };
  const tags = group(tagRows);
  const subs = group(subRows);
  const atts = group(attRows);
  return {
    exportedAt: nowIso(),
    user: { email: u?.email ?? '', name: u?.name ?? '' },
    categories: cats.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    tasks: rows.map(({ userId: _u, gcalEventId: _g, gcalSyncedAt: _s, ...r }) => ({
      ...r,
      tags: (tags.get(r.id) ?? []).map((t) => t.tag).sort(),
      subtasks: (subs.get(r.id) ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({ title: s.title, done: s.done === 1 })),
      attachments: (atts.get(r.id) ?? []).map((a) => ({
        filename: a.filename,
        mime: a.mime,
        sizeBytes: a.sizeBytes,
      })),
    })),
    focusSessions: fs.map((f) => ({
      taskId: f.taskId,
      startedAt: f.startedAt,
      endedAt: f.endedAt,
      minutes: f.minutes,
    })),
  };
}

// ---------------------------------------------------------------- CSV
const COLUMNS = [
  'id',
  'title',
  'description',
  'category',
  'status',
  'urgency',
  'importance',
  'all_day',
  'start',
  'end',
  'due',
  'due_date',
  'estimate_minutes',
  'tags',
  'subtasks',
  'recurrence',
  'series_id',
  'occurrence',
  'created_at',
  'completed_at',
] as const;

/** ป้องกัน CSV/formula injection: เซลล์ที่ขึ้นต้นด้วย = + - @ tab CR จะถูกใส่ ' นำหน้า (Excel/Sheets ไม่คำนวณ) แล้วครอบด้วย " และ escape " */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const local = (iso: string | null) =>
  iso ? `${bangkokDate(new Date(iso))} ${bangkokHm(new Date(iso))}` : '';

export function toCsv(d: ExportData): string {
  const cat = new Map(d.categories.map((c) => [c.id, c.name]));
  const lines = [COLUMNS.map(csvCell).join(',')];
  for (const t of d.tasks) {
    const row: Record<(typeof COLUMNS)[number], unknown> = {
      id: t.id,
      title: t.title,
      description: t.description,
      category: t.categoryId ? (cat.get(t.categoryId) ?? '') : '',
      status: t.status,
      urgency: t.urgency,
      importance: t.importance,
      all_day: t.allDay ? 1 : 0,
      start: local(t.startAt),
      end: local(t.endAt),
      due: local(t.dueAt),
      due_date: t.dueDate ?? '',
      estimate_minutes: t.estimateMinutes ?? '',
      tags: t.tags.join(' '),
      subtasks: t.subtasks.map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`).join('; '),
      recurrence: t.recurrenceRule ?? '',
      series_id: t.parentTaskId ?? '',
      occurrence: t.recurrenceId ?? '',
      created_at: t.createdAt,
      completed_at: t.completedAt ?? '',
    };
    lines.push(COLUMNS.map((c) => csvCell(row[c])).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`; // BOM ให้ Excel อ่านภาษาไทยถูก
}

// ---------------------------------------------------------------- ICS
const enc = new TextEncoder();

/** ตัดบรรทัดไม่เกิน 75 ไบต์ (RFC 5545) โดยไม่ตัดกลางตัวอักษร UTF-8 */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
      limit = 75;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

/** escape ค่าข้อความ: \ ; , และขึ้นบรรทัดใหม่ — กันฉีดบรรทัดคำสั่งของ ICS */
export const icsText = (s: string): string =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
const utc = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
const ymdCompact = (s: string) => s.replace(/-/g, '');

export function toIcs(d: ExportData, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const cat = new Map(d.categories.map((c) => [c.id, c.name]));
  const byParent = new Map<string, string[]>(); // วันที่ของครั้งที่มีแถวจริง → EXDATE ที่แม่
  for (const t of d.tasks)
    if (t.parentTaskId && t.recurrenceId)
      byParent.set(t.parentTaskId, [...(byParent.get(t.parentTaskId) ?? []), t.recurrenceId]);

  const L: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dobby//Time Management//TH',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Dobby',
    'X-WR-TIMEZONE:Asia/Bangkok',
  ];
  const stamp = utc(new Date(d.exportedAt));
  for (const t of d.tasks) {
    if (t.status === 'cancelled' || (!t.startAt && !t.dueAt && !t.dueDate)) continue; // ไม่มีวันที่/ยกเลิก ไม่ลงปฏิทิน
    const allDay = t.allDay && !!t.dueDate;
    const ev: string[] = ['BEGIN:VEVENT', `UID:${t.id}@dobby`, `DTSTAMP:${stamp}`];
    let baseStart: Date | null = null;
    let prefix = t.status === 'done' ? '✅ ' : '';
    if (allDay) {
      const next = new Date(`${t.dueDate}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      ev.push(
        `DTSTART;VALUE=DATE:${ymdCompact(t.dueDate!)}`,
        `DTEND;VALUE=DATE:${ymdCompact(next.toISOString().slice(0, 10))}`,
      );
    } else if (t.startAt) {
      const s = new Date(t.startAt);
      const e = t.endAt
        ? new Date(t.endAt)
        : new Date(s.getTime() + (t.estimateMinutes ?? 60) * 60_000);
      ev.push(`DTSTART:${utc(s)}`, `DTEND:${utc(e)}`);
      baseStart = s;
    } else {
      const due = new Date(t.dueAt!);
      const s = new Date(due.getTime() - 30 * 60_000);
      prefix += '⏰ ';
      ev.push(`DTSTART:${utc(s)}`, `DTEND:${utc(due)}`);
      baseStart = s;
    }
    ev.push(`SUMMARY:${icsText(prefix + t.title)}`);
    const desc = [t.description, ...t.subtasks.map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`)]
      .filter(Boolean)
      .join('\n');
    if (desc) ev.push(`DESCRIPTION:${icsText(desc)}`);
    const cats = [t.categoryId ? cat.get(t.categoryId) : null, ...t.tags].filter(
      (x): x is string => !!x,
    );
    if (cats.length) ev.push(`CATEGORIES:${cats.map(icsText).join(',')}`);
    ev.push(`URL:${base}/?task=${t.id}`);
    if (t.recurrenceRule) {
      // UNTIL ของงานมีเวลาต้องเป็น UTC date-time (สิ้นวันไทย = 16:59:59Z)
      ev.push(
        `RRULE:${allDay ? t.recurrenceRule : t.recurrenceRule.replace(/UNTIL=(\d{8})/, 'UNTIL=$1T165959Z')}`,
      );
      for (const dt of byParent.get(t.id) ?? []) {
        if (allDay || !baseStart) {
          ev.push(`EXDATE;VALUE=DATE:${ymdCompact(dt)}`);
        } else {
          // เวลาเริ่มของแม่ + จำนวนวันเต็มถึงครั้งนั้น (ไทยไม่มี DST)
          const days = Math.round(
            (Date.parse(`${dt}T00:00:00Z`) - Date.parse(`${bangkokDate(baseStart)}T00:00:00Z`)) /
              86_400_000,
          );
          ev.push(`EXDATE:${utc(new Date(baseStart.getTime() + days * 86_400_000))}`);
        }
      }
    }
    ev.push('END:VEVENT');
    L.push(...ev);
  }
  L.push('END:VCALENDAR');
  return `${L.map(foldLine).join('\r\n')}\r\n`;
}

export { toBangkokIso };

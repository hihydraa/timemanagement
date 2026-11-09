import { excelDate, type Cell, type Sheet } from './xlsx';

export interface ImportTask {
  title: string;
  description: string;
  status: 'todo' | 'doing' | 'done' | 'cancelled';
  dueDate: string | null;
  completedAt: string | null;
  tags: string[];
}
export interface SheetPlan {
  name: string;
  tasks: ImportTask[];
  /** ชีตสรุป/รวมของชีตอื่น (ชื่อขึ้นต้น AllTask) — ไม่เลือกให้โดยอัตโนมัติ กันนำเข้าซ้ำ */
  aggregate: boolean;
}

const norm = (c: Cell) => String(c ?? '').toLowerCase();
const text = (c: Cell) => (c === null || c === undefined ? '' : String(c).trim());
const HEADERS = {
  title: 'title',
  detail: 'detail',
  date: 'date',
  due: 'due',
  submit: 'submit',
  status: 'status',
  dep: 'dep',
  note: 'note',
} as const;
type Key = keyof typeof HEADERS;

/** หาแถวหัวตาราง (มีคอลัมน์ Title และ Due) แล้วจับคอลัมน์ตามชื่อหัว — ใช้กับแม่แบบ Task Management เดิม */
export function findColumns(
  rows: Cell[][],
): { header: number; col: Partial<Record<Key, number>> } | null {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const r = rows[i] ?? [];
    const col: Partial<Record<Key, number>> = {};
    r.forEach((c, j) => {
      const s = norm(c);
      if (!s) return;
      (Object.keys(HEADERS) as Key[]).forEach((k) => {
        // "Task + Due" ไม่ใช่คอลัมน์วันครบกำหนด
        if (col[k] === undefined && s.includes(HEADERS[k]) && !s.includes('task +')) col[k] = j;
      });
    });
    if (col.title !== undefined && col.due !== undefined) return { header: i, col };
  }
  return null;
}

const dateOf = (c: Cell) => (typeof c === 'number' ? excelDate(c) : null);
const toIso = (ymd: string, today: string) => {
  const d = ymd < today ? ymd : today;
  return new Date(Date.parse(`${d}T12:00:00+07:00`)).toISOString();
};

/**
 * แปลงแถวของชีตเป็นงาน:
 * Complete หรือติ๊ก Submit → เสร็จ, Cancel → ยกเลิก, On Process → กำลังทำ, อื่น ๆ → ยังไม่เริ่ม
 * วันครบกำหนด = Due (ไม่มีใช้ Date); ถ้ามีทั้งคู่และต่างกัน วันเริ่มเก็บในรายละเอียด
 */
export function sheetToTasks(sheet: Sheet, today: string): ImportTask[] {
  const f = findColumns(sheet.rows);
  if (!f) return [];
  const get = (r: Cell[], k: Key) => (f.col[k] === undefined ? null : (r[f.col[k]!] ?? null));
  const out: ImportTask[] = [];
  for (const r of sheet.rows.slice(f.header + 1)) {
    const title = text(get(r, 'title')).replace(/\s+/g, ' ').slice(0, 200);
    if (!title || !r) continue;
    const status = text(get(r, 'status'));
    const submit = get(r, 'submit') === true;
    const due = dateOf(get(r, 'due'));
    const start = dateOf(get(r, 'date'));
    const day = due ?? start;
    const st: ImportTask['status'] =
      status === 'Complete' || submit
        ? 'done'
        : status === 'Cancel' || status === 'Cancelled'
          ? 'cancelled'
          : status === 'On Process'
            ? 'doing'
            : 'todo';
    const desc = [text(get(r, 'detail'))].filter(Boolean);
    const note = text(get(r, 'note'));
    if (note) desc.push(`หมายเหตุ: ${note}`);
    if (start && due && start !== due) {
      const [y, m, d] = start.split('-');
      desc.push(`เริ่ม: ${d}/${m}/${y}`);
    }
    const dep = text(get(r, 'dep'));
    const tags = [sheet.name.slice(0, 30)];
    if (dep && dep !== sheet.name) tags.push(dep.slice(0, 30));
    out.push({
      title,
      description: desc.join('\n').slice(0, 5000),
      status: st,
      dueDate: day,
      completedAt: st === 'done' ? toIso(day ?? today, today) : null,
      tags,
    });
  }
  return out;
}

export function planImport(sheets: Sheet[], today: string): SheetPlan[] {
  return sheets
    .map((s) => ({
      name: s.name,
      tasks: sheetToTasks(s, today),
      aggregate: /^alltask/i.test(s.name),
    }))
    .filter((p) => p.tasks.length > 0);
}

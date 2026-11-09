import { addDaysYmd } from './dates';
import type { PlanTask } from './planner';
import type { Task } from './types';

export interface DayCount {
  open: number;
  done: number;
}
export interface DashboardData {
  today: string;
  month: string;
  work: { start: string; end: string; days: number[] };
  deadlines: {
    open: number;
    done: number;
    overdue: number;
    completionRate: number;
    onTimeRate: number | null;
    perDay: Record<string, DayCount>;
    byCategory: { categoryId: string | null; open: number; done: number }[];
    tasks: Task[];
    truncated: boolean;
  };
  important: Task[];
  performance: {
    weekly: { weekStart: string; done: number }[];
    doneThisWeek: number;
    doneLastWeek: number;
    streak: number;
    focusMinutesWeek: number;
  };
  week: PlanTask[];
  attention: { stalled: Task[]; overdue: number; unscheduled: number };
}

export const shiftMonth = (month: string, delta: number): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
};

const MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];
/** "พ.ย. 2569" (พ.ศ.) */
export const monthTitle = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y + 543}`;
};

export interface MonthCell {
  /** null = ช่องว่างก่อน/หลังเดือน */
  ymd: string | null;
  day: number;
}
/** ตารางเดือน (สัปดาห์เริ่มวันจันทร์): คืนแถวละ 7 ช่อง */
export function monthGrid(month: string): MonthCell[][] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = `${month}-01`;
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: MonthCell[] = [
    ...Array.from({ length: lead }, () => ({ ymd: null, day: 0 })),
    ...Array.from({ length: days }, (_, i) => ({ ymd: addDaysYmd(first, i), day: i + 1 })),
  ];
  while (cells.length % 7) cells.push({ ymd: null, day: 0 });
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

/** ระดับความหนาแน่นของเดดไลน์ต่อวัน 0–3 (ไม่มี / 1 / 2–3 / 4+) */
export const heatLevel = (n: number): 0 | 1 | 2 | 3 => (n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : 3);

/** วันนี้ของเดดไลน์ (เวลาไทย) */
export const deadlineYmd = (t: Pick<Task, 'dueAt' | 'dueDate'>): string | null =>
  t.dueAt ? new Date(Date.parse(t.dueAt) + 7 * 3_600_000).toISOString().slice(0, 10) : t.dueDate;

/** เปรียบเทียบสัปดาห์นี้กับสัปดาห์ก่อน: ข้อความ + ทิศทาง (ไม่ใช้สีอย่างเดียว) */
export function trend(cur: number, prev: number): { arrow: '▲' | '▼' | '＝'; diff: number } {
  const diff = cur - prev;
  return { arrow: diff > 0 ? '▲' : diff < 0 ? '▼' : '＝', diff: Math.abs(diff) };
}

import { isoToWall, wallToIso } from './time';
import type { Task } from './types';

/**
 * ค่า "เมื่อไหร่" ของฟอร์มงาน แบบง่าย: วัน (ค่าเริ่มต้น = วันนี้) + เวลาเริ่มแบบ 24 ชม. (ไม่ใส่ = ไม่กำหนดเวลา)
 * + ระยะเวลา (แทนเวลาสิ้นสุด) + เดดไลน์แบบเลือกเพิ่ม — แปลงเป็นฟิลด์ของงานเดิมโดยไม่เปลี่ยนโมเดลข้อมูล
 */
export interface WhenForm {
  /** วันที่ทำ YYYY-MM-DD ('' = ไม่ระบุวัน → ไปที่ "ยังไม่จัดเวลา") */
  day: string;
  /** เวลาเริ่ม HH:mm 24 ชม. ('' = ไม่กำหนดเวลา) */
  startTime: string;
  /** ระยะเวลา (นาที) ใช้เป็นทั้งเวลาประมาณและเวลาสิ้นสุด (= เริ่ม + ระยะเวลา) */
  duration: number;
  deadlineOn: boolean;
  deadlineDate: string;
  /** '' = สิ้นวัน (23:59) */
  deadlineTime: string;
}

export const DEFAULT_DURATION = 30;
export const DURATION_CHIPS = [15, 30, 60, 120] as const;
export const END_OF_DAY = '23:59';

export const emptyWhen = (today: string): WhenForm => ({
  day: today,
  startTime: '',
  duration: DEFAULT_DURATION,
  deadlineOn: false,
  deadlineDate: today,
  deadlineTime: '',
});

const minutesBetween = (aIso: string, bIso: string) =>
  Math.round((Date.parse(bIso) - Date.parse(aIso)) / 60_000);
const hm = (iso: string) => isoToWall(iso).slice(11, 16);
const ymd = (iso: string) => isoToWall(iso).slice(0, 10);

/** ค่าเริ่มต้นของฟอร์มจากงานเดิม (แก้ไข) หรือจาก prefill ของปฏิทิน (สร้างใหม่) */
export function whenFromTask(
  task:
    | Pick<Task, 'allDay' | 'startAt' | 'endAt' | 'dueAt' | 'dueDate' | 'estimateMinutes'>
    | undefined,
  prefill: { allDay?: boolean; startInput?: string; endInput?: string; date?: string } | undefined,
  today: string,
): WhenForm {
  const base = emptyWhen(today);
  if (task) {
    const est =
      task.estimateMinutes && task.estimateMinutes > 0 ? task.estimateMinutes : DEFAULT_DURATION;
    if (task.startAt) {
      const span = task.endAt ? minutesBetween(task.startAt, task.endAt) : 0;
      return {
        ...base,
        day: ymd(task.startAt),
        startTime: hm(task.startAt),
        duration: span > 0 ? span : est,
        ...(task.dueAt
          ? {
              deadlineOn: true,
              deadlineDate: ymd(task.dueAt),
              deadlineTime: hm(task.dueAt) === END_OF_DAY ? '' : hm(task.dueAt),
            }
          : {}),
      };
    }
    if (task.allDay && task.dueDate) return { ...base, day: task.dueDate, duration: est };
    if (task.dueAt)
      return {
        ...base,
        day: '',
        duration: est,
        deadlineOn: true,
        deadlineDate: ymd(task.dueAt),
        deadlineTime: hm(task.dueAt) === END_OF_DAY ? '' : hm(task.dueAt),
      };
    return { ...base, day: '', duration: est }; // ยังไม่มีวัน (Inbox)
  }
  if (prefill?.startInput) {
    const start = prefill.startInput; // YYYY-MM-DDTHH:mm (เวลาไทย)
    const span = prefill.endInput
      ? minutesBetween(wallToIso(start), wallToIso(prefill.endInput))
      : 0;
    return {
      ...base,
      day: start.slice(0, 10),
      startTime: start.slice(11, 16),
      duration: span > 0 ? span : DEFAULT_DURATION,
    };
  }
  if (prefill?.date) return { ...base, day: prefill.date, deadlineDate: prefill.date };
  return base;
}

export interface WhenPayload {
  allDay: boolean;
  startAt: string | null;
  endAt: string | null;
  dueAt: string | null;
  dueDate: string | null;
  estimateMinutes: number;
}

const clampDuration = (d: number) =>
  Number.isFinite(d) && d >= 1 ? Math.min(1440, Math.round(d)) : DEFAULT_DURATION;
const timeOk = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** ข้อความผิดพลาดภาษาคน (null = ใช้ได้) */
export function validateWhen(w: WhenForm): string | null {
  if (w.startTime && !timeOk(w.startTime)) return 'เวลาเริ่มไม่ถูกต้อง';
  if (w.startTime && !w.day) return 'เลือกวันก่อนกำหนดเวลา';
  if (w.deadlineOn) {
    if (!w.deadlineDate) return 'เลือกวันของเดดไลน์';
    if (w.deadlineTime && !timeOk(w.deadlineTime)) return 'เวลาเดดไลน์ไม่ถูกต้อง';
    if (w.startTime) {
      const start = wallToIso(`${w.day}T${w.startTime}`);
      const due = wallToIso(`${w.deadlineDate}T${w.deadlineTime || END_OF_DAY}`);
      if (due < start) return 'เดดไลน์ต้องไม่ก่อนเวลาเริ่ม';
    }
  }
  return null;
}

/**
 * แปลงเป็นฟิลด์ของงาน:
 *  - มีเวลาเริ่ม → start/end(= เริ่ม + ระยะเวลา) (+ dueAt ถ้าตั้งเดดไลน์)
 *  - ไม่มีเวลา ไม่มีเดดไลน์ → งานทั้งวันของวันนั้น (dueDate)
 *  - ไม่มีเวลา แต่มีเดดไลน์ → งานที่มีเดดไลน์และยังไม่จัดเวลา (dueAt; วันที่ทำจะกำหนดทีหลังเมื่อเลือกเวลาเริ่ม)
 *  - ไม่ระบุวัน ไม่มีเดดไลน์ → ไม่มีวัน (ยังไม่จัดเวลา)
 */
export function whenToPayload(w: WhenForm): WhenPayload {
  const duration = clampDuration(w.duration);
  const dueAt =
    w.deadlineOn && w.deadlineDate
      ? wallToIso(`${w.deadlineDate}T${w.deadlineTime || END_OF_DAY}`)
      : null;
  if (w.startTime && w.day) {
    const startAt = wallToIso(`${w.day}T${w.startTime}`);
    return {
      allDay: false,
      startAt,
      endAt: new Date(Date.parse(startAt) + duration * 60_000).toISOString(),
      dueAt,
      dueDate: null,
      estimateMinutes: duration,
    };
  }
  if (dueAt)
    return {
      allDay: false,
      startAt: null,
      endAt: null,
      dueAt,
      dueDate: null,
      estimateMinutes: duration,
    };
  if (w.day)
    return {
      allDay: true,
      startAt: null,
      endAt: null,
      dueAt: null,
      dueDate: w.day,
      estimateMinutes: duration,
    };
  return {
    allDay: false,
    startAt: null,
    endAt: null,
    dueAt: null,
    dueDate: null,
    estimateMinutes: duration,
  };
}

/** บรรทัดสรุปให้ผู้ใช้เห็นว่าบันทึกอะไร เช่น "พฤ. 5 พ.ย. 14:00–14:30 · เดดไลน์ ศ. 6 พ.ย. 17:00" */
export function summarizeWhen(w: WhenForm, label: (ymd: string) => string): string {
  const addMin = (t: string, m: number) => {
    const total = (Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + m) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };
  const parts: string[] = [];
  if (w.day && w.startTime)
    parts.push(`${label(w.day)} ${w.startTime}–${addMin(w.startTime, clampDuration(w.duration))}`);
  else if (w.day && !(w.deadlineOn && !w.startTime)) parts.push(`${label(w.day)} (ไม่กำหนดเวลา)`);
  else if (!w.deadlineOn) parts.push('ยังไม่กำหนดวัน');
  if (w.deadlineOn && w.deadlineDate)
    parts.push(
      `เดดไลน์ ${label(w.deadlineDate)}${w.deadlineTime ? ` ${w.deadlineTime}` : ' (สิ้นวัน)'}`,
    );
  return parts.join(' · ');
}

// ใช้ parser ภาษาไทยตัวเดียวกับ LINE (ไม่เขียนซ้ำ): src/services/parser.ts เป็นฟังก์ชันบริสุทธิ์ ไม่มี API เฉพาะ Worker
import { computeUrgency } from '../../../../src/lib/urgency';
import { parseTask, type ParsedTask } from '../../../../src/services/parser';
import {
  DEFAULT_DURATION,
  emptyWhen,
  validateWhen,
  whenToPayload,
  type WhenForm,
} from './taskForm';
import { wallToIso } from './time';
import type { Category, Task, TaskPayload } from './types';

export interface QuickState {
  title: string;
  when: WhenForm;
  important: boolean;
  categoryId: string | null;
  tags: string[];
  recurrence: string | null;
  /** ข้อความเตือนเมื่อวัน/เวลาที่พิมพ์ผ่านมาแล้ว */
  pastWarning: string | null;
  /** ผู้ใช้พิมพ์ว่า "วันหลัง/สักวัน" (ไม่เร่ง) */
  someday: boolean;
  /** ชื่อประเภทที่จับได้ (แสดงในชิป) */
  categoryName: string | null;
  /** parser จับได้ว่ามีวัน/เวลา/เดดไลน์ใดบ้าง (ใช้ซ่อนชิปที่ไม่เกี่ยว) */
  hasExplicitWhen: boolean;
  parsed: ParsedTask;
}

/**
 * พิมพ์ประโยคเดียว → สถานะของงาน (ค่าเริ่มต้น "วันนี้ ไม่กำหนดเวลา 30 นาที"; "วันหลัง/สักวัน" = ยังไม่จัดเวลา)
 * ผู้ใช้แก้ผ่านชิปได้ก่อนกด Enter โดยทับค่าด้วย overrides
 */
export function parseQuickAdd(
  text: string,
  now: Date,
  today: string,
  categories: Pick<Category, 'id' | 'name'>[],
): QuickState {
  const p = parseTask(text, now, categories);
  const when = emptyWhen(today);
  if (p.estimateMinutes) when.duration = p.estimateMinutes;
  if (p.date && p.time) {
    when.day = p.date;
    when.startTime = p.time;
    if (p.endTime && !p.estimateMinutes) {
      const span = Math.round(
        (Date.parse(wallToIso(`${p.date}T${p.endTime}`)) -
          Date.parse(wallToIso(`${p.date}T${p.time}`))) /
          60_000,
      );
      when.duration = span > 0 ? span : span + 1440 > 0 ? span + 1440 : DEFAULT_DURATION;
    }
  } else if (p.date) {
    when.day = p.date;
  }
  if (p.due) {
    when.deadlineOn = true;
    when.deadlineDate = p.due.date;
    when.deadlineTime = p.due.time ?? '';
    if (!p.date) when.day = ''; // มีแต่เดดไลน์ → ยังไม่จัดเวลา (วันที่ทำเลือกทีหลัง)
  } else if (!p.date && p.someday) {
    when.day = ''; // "วันหลัง" → ยังไม่จัดเวลา
  }
  const cat = categories.find((c) => c.id === p.categoryId);
  return {
    title: p.title,
    when,
    important: (p.importance ?? 2) >= 3,
    categoryId: p.categoryId ?? null,
    categoryName: cat?.name ?? null,
    tags: p.tags,
    recurrence: p.recurrence ?? null,
    someday: !!p.someday,
    hasExplicitWhen: !!(p.date || p.due),
    pastWarning: p.needsConfirm
      ? p.needsConfirm.reason === 'past_time'
        ? 'เวลานี้ของวันนี้ผ่านไปแล้ว'
        : 'วันที่นี้ผ่านมาแล้ว'
      : null,
    parsed: p,
  };
}

export type QuickOverrides = Partial<{ when: Partial<WhenForm>; important: boolean }>;

/** ใช้ค่าที่ผู้ใช้แก้ผ่านชิปทับผลจาก parser */
export function applyOverrides(q: QuickState, o: QuickOverrides): QuickState {
  return { ...q, when: { ...q.when, ...(o.when ?? {}) }, important: o.important ?? q.important };
}

/** payload สำหรับสร้างงาน (null + ข้อความ ถ้ายังบันทึกไม่ได้) */
export function buildQuickPayload(q: QuickState): { payload: TaskPayload } | { error: string } {
  if (!q.title.trim()) return { error: 'พิมพ์ชื่องานก่อน' };
  const err = validateWhen(q.when);
  if (err) return { error: err };
  const w = whenToPayload(q.when);
  return {
    payload: {
      title: q.title.trim(),
      description: '',
      categoryId: q.categoryId,
      importance: q.important ? 4 : 2,
      status: 'todo',
      ...w,
      tags: q.tags,
      ...(q.recurrence ? { recurrenceRule: q.recurrence } : {}),
    },
  };
}

/** งานชั่วคราวสำหรับแสดงทันที (optimistic) ก่อนที่เซิร์ฟเวอร์ตอบกลับ */
export function tmpTaskFromPayload(payload: TaskPayload, id: string, now: Date): Task {
  const p = payload;
  const base = {
    id,
    title: p.title ?? '',
    description: '',
    categoryId: p.categoryId ?? null,
    importance: p.importance ?? 2,
    status: 'todo' as const,
    allDay: !!p.allDay,
    startAt: p.startAt ?? null,
    endAt: p.endAt ?? null,
    dueAt: p.dueAt ?? null,
    dueDate: p.dueDate ?? null,
    estimateMinutes: p.estimateMinutes ?? null,
    tags: p.tags ?? [],
    attachmentCount: 0,
    subtaskTotal: 0,
    subtaskDone: 0,
    parentTaskId: null,
    recurrenceId: null,
    recurrenceRule: p.recurrenceRule ?? null,
    gcalSync: true,
    gcalEventId: null,
    gcalSyncedAt: null,
    completedAt: null,
    snoozeCount: 0,
  };
  return { ...base, urgency: computeUrgency(base, now) } as Task;
}

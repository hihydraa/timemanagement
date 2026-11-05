import type { Task, TaskPayload } from './types';

export const TASKS_CHANGED = 'dobby:tasks-changed';
export const notifyTasksChanged = () =>
  (globalThis as unknown as { dispatchEvent(e: Event): boolean }).dispatchEvent(
    new Event(TASKS_CHANGED),
  );

/** ลบแล้วเลิกทำได้เฉพาะงานที่สร้างกลับได้ครบ: ไม่มีไฟล์แนบ/subtask/ไม่อยู่ในซีรีส์ (ไฟล์ที่ลบจาก R2 กู้ไม่ได้) */
export const canUndoDelete = (t: Task) =>
  t.attachmentCount === 0 && t.subtaskTotal === 0 && !t.recurrenceId && !t.recurrenceRule;

/** ข้อมูลที่ใช้สร้างงานเดิมกลับมา (urgency คำนวณเอง จึงไม่ส่ง) */
export function restorePayload(t: Task): TaskPayload {
  return {
    title: t.title,
    description: t.description,
    categoryId: t.categoryId,
    importance: t.importance,
    status: t.status,
    allDay: t.allDay,
    startAt: t.startAt,
    endAt: t.endAt,
    dueAt: t.dueAt,
    dueDate: t.dueDate,
    estimateMinutes: t.estimateMinutes,
    tags: t.tags,
    gcalSync: t.gcalSync,
  };
}

/** ค่าเดิมที่ต้องใส่กลับเมื่อเลิกเลื่อน */
export const snoozeRevertPayload = (t: Task): TaskPayload => ({
  allDay: t.allDay,
  startAt: t.startAt,
  endAt: t.endAt,
  dueAt: t.dueAt,
  dueDate: t.dueDate,
});

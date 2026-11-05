import { addDaysYmd } from './dates';
import type { Task, TaskPayload } from './types';

/**
 * ย้ายช่อง: ความสำคัญ = ปรับค่าตรง ๆ; ความเร่งด่วนคำนวณจากเดดไลน์ จึง "เสนอเดดไลน์ใหม่" แทน
 * (ไปฝั่งด่วน → วันนี้, ไปฝั่งไม่ด่วน → อีก 5 วัน) เฉพาะเมื่อข้ามเส้นแบ่ง
 */
export function movedPatch(
  x: Pick<Task, 'urgency' | 'importance' | 'allDay' | 'startAt' | 'dueAt'>,
  to: { urgent: boolean; important: boolean },
  today: string,
): TaskPayload {
  const patch: TaskPayload = {};
  if (to.important !== x.importance >= 3) patch.importance = to.important ? 4 : 2;
  if (to.urgent !== x.urgency >= 3) {
    const ymd = to.urgent ? today : addDaysYmd(today, 5);
    if (x.allDay || (!x.startAt && !x.dueAt)) {
      patch.allDay = true;
      patch.dueDate = ymd;
    } else patch.dueAt = `${addDaysYmd(ymd, -1)}T16:59:00.000Z`; // 23:59 เวลาไทย
  }
  return patch;
}

import { addDays, bangkokDate } from './time';

/**
 * ความเร่งด่วน "คำนวณเอง" จากวันที่เกี่ยวข้องของงาน (ผู้ใช้ไม่ต้องตั้ง) — ฟังก์ชันบริสุทธิ์ รับ `now` เป็นพารามิเตอร์
 *
 *   ref = due_at ?? due_date ?? start_at (เทียบเป็นวันที่ใน Asia/Bangkok)
 *   ไม่มี ref                 → 1
 *   เลยกำหนดหรือเป็นวันนี้    → 4
 *   พรุ่งนี้                  → 3
 *   ภายใน 3 วัน               → 2
 *   อื่น ๆ                    → 1
 *
 * คอลัมน์ `urgency` ใน DB ยังอยู่ แต่ไม่ใช่แหล่งความจริงอีก (ค่าที่ส่งออกจาก API คำนวณจากฟังก์ชันนี้ทุกครั้ง)
 */
export type UrgencyLevel = 1 | 2 | 3 | 4;

export function computeUrgency(
  task: { dueAt?: string | null; dueDate?: string | null; startAt?: string | null },
  now: Date,
): UrgencyLevel {
  const ref = task.dueAt
    ? bangkokDate(new Date(task.dueAt))
    : (task.dueDate ?? (task.startAt ? bangkokDate(new Date(task.startAt)) : null));
  if (!ref) return 1;
  const today = bangkokDate(now);
  if (ref <= today) return 4;
  if (ref === addDays(today, 1)) return 3;
  if (ref <= addDays(today, 3)) return 2;
  return 1;
}

/**
 * แอนิเมชัน: ค่าเริ่มต้นเคารพการตั้งค่า "ลดการเคลื่อนไหว" ของระบบ (เอฟเฟกต์แบบนุ่มนวล: จางเข้า/แสงเรือง ไม่มีการเด้ง/หมุน/กระจาย)
 * ผู้ใช้เลือก "แสดงแอนิเมชันเต็มรูปแบบ" ได้ (เก็บเฉพาะเครื่องนี้) → html[data-motion=full] ใช้ override ใน index.css
 */
const KEY = 'dobby.motion';

export function motionFull(): boolean {
  try {
    return localStorage.getItem(KEY) === 'full';
  } catch {
    return false;
  }
}

export function applyMotionPref(): void {
  document.documentElement.dataset.motion = motionFull() ? 'full' : 'auto';
}

export function setMotionFull(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, 'full');
    else localStorage.removeItem(KEY);
  } catch {
    /* ไม่มี storage: ใช้ได้เฉพาะรอบนี้ */
  }
  document.documentElement.dataset.motion = on ? 'full' : 'auto';
}

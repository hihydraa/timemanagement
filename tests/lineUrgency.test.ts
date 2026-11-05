import { describe, expect, it } from 'vitest';
import { toTaskInput } from '../src/services/lineBot';
import { parseTask } from '../src/services/parser';

const NOW = new Date('2026-11-04T03:00:00Z');
const TODAY = '2026-11-04';
const mk = (text: string) => toTaskInput(parseTask(text, NOW), TODAY);

describe('LINE: !ด่วน ถูกตีความเป็นเดดไลน์ (ไม่ตั้ง urgency ตรง ๆ)', () => {
  it('!ด่วน / !ด่วนมาก / !u3 / !u4 ที่ไม่ระบุวัน → เดดไลน์วันนี้', () => {
    for (const w of ['!ด่วน', '!ด่วนมาก', '!u3', '!u4']) {
      const t = mk(`โทรหาลูกค้า ${w}`);
      expect(t.dueDate, w).toBe(TODAY);
      expect(t.allDay, w).toBe(true);
    }
  });
  it('!ด่วนต่ำ (u1/u2) ไม่ตั้งเดดไลน์ → ยังไม่จัดเวลา', () => {
    expect(mk('โทรหาลูกค้า !u1').dueDate).toBeNull();
    expect(mk('โทรหาลูกค้า !u2').dueDate).toBeNull();
  });
  it('ถ้าระบุวันอยู่แล้ว ใช้วันที่ระบุ (ไม่ทับด้วยวันนี้)', () => {
    expect(mk('ส่งรายงาน พรุ่งนี้ !ด่วน').dueDate).toBe('2026-11-05');
  });
  it('!สำคัญ / คำว่า สำคัญ = ติ๊กสำคัญ (importance 4); ไม่ใส่ = 2', () => {
    expect(mk('ส่งรายงาน !สำคัญ').importance).toBe(4);
    expect(mk('ส่งรายงาน สำคัญ').importance).toBe(4);
    expect(mk('ส่งรายงาน !p1').importance).toBe(2);
    expect(mk('ส่งรายงาน').importance).toBe(2);
  });
});

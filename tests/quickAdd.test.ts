import { describe, expect, it } from 'vitest';
import {
  applyOverrides,
  buildQuickPayload,
  parseQuickAdd,
  tmpTaskFromPayload,
} from '../apps/web/src/lib/quickAdd';

// พฤหัส 5 พ.ย. 2026 10:00 ไทย
const NOW = new Date('2026-11-05T03:00:00Z');
const TODAY = '2026-11-05';
const CATS = [
  { id: 'c-work', name: 'งาน' },
  { id: 'c-life', name: 'ส่วนตัว' },
];
const q = (s: string) => parseQuickAdd(s, NOW, TODAY, CATS);
const at = (hm: string, d: string) => new Date(`${d}T${hm}:00+07:00`).toISOString();
const payload = (s: string) => {
  const r = buildQuickPayload(q(s));
  if ('error' in r) throw new Error(r.error);
  return r.payload;
};

describe('Quick Add: ประโยคเดียว → ชิปพรีวิว → บันทึกตรงกับพรีวิว', () => {
  it('"ส่งรายงาน พรุ่งนี้ 14:00 สำคัญ" → วัน/เวลา/สำคัญถูกต้อง', () => {
    const s = q('ส่งรายงาน พรุ่งนี้ 14:00 สำคัญ');
    expect(s.title).toBe('ส่งรายงาน');
    expect(s.when).toMatchObject({ day: '2026-11-06', startTime: '14:00', duration: 30 });
    expect(s.important).toBe(true);
    const p = payload('ส่งรายงาน พรุ่งนี้ 14:00 สำคัญ');
    expect(p).toMatchObject({
      title: 'ส่งรายงาน',
      importance: 4,
      allDay: false,
      startAt: at('14:00', '2026-11-06'),
      endAt: at('14:30', '2026-11-06'),
      estimateMinutes: 30,
    });
  });
  it('ไม่ระบุวัน = วันนี้ ไม่กำหนดเวลา (ค่าเริ่มต้น)', () => {
    expect(payload('ซื้อกาแฟ')).toMatchObject({
      allDay: true,
      dueDate: TODAY,
      startAt: null,
      importance: 2,
      estimateMinutes: 30,
    });
  });
  it('"วันหลัง/สักวัน" → ยังไม่จัดเวลา (ไม่มีวัน)', () => {
    const p = payload('จัดโต๊ะทำงาน วันหลัง');
    expect(p).toMatchObject({
      title: 'จัดโต๊ะทำงาน',
      allDay: false,
      dueDate: null,
      startAt: null,
      dueAt: null,
    });
    expect(payload('เรียนทำขนม สักวัน').dueDate).toBeNull();
  });
  it('ระยะเวลา/ประเภท/แท็ก/ทำซ้ำ/เดดไลน์ ถูกจับครบ', () => {
    const s = q('ประชุมทีม 10:00 2 ชม. #งาน @ทีม ทุกวันจันทร์');
    expect(s.when).toMatchObject({ startTime: '10:00', duration: 120 });
    expect(s.categoryId).toBe('c-work');
    expect(s.categoryName).toBe('งาน');
    expect(s.tags).toEqual(['ทีม']);
    expect(s.recurrence).toBe('FREQ=WEEKLY;BYDAY=MO');
    const d = q('ส่งใบเสนอราคา ภายใน 17:00');
    expect(d.when).toMatchObject({ deadlineOn: true, deadlineTime: '17:00' });
  });
  it('เดดไลน์ที่ไม่มีเวลาเริ่ม → งานเดดไลน์ที่ยังไม่จัดเวลา', () => {
    const p = payload('ส่งรายงาน เดดไลน์ ศุกร์ 17:00');
    expect(p).toMatchObject({ startAt: null, dueDate: null });
    expect(p.dueAt).toBe(at('17:00', '2026-11-06'));
  });
  it('แจ้งเตือนเมื่อวัน/เวลาผ่านมาแล้ว (ไม่เดาเอง) แต่ยังบันทึกตามที่พิมพ์ได้', () => {
    expect(q('โทรหาลูกค้า 09:00').pastWarning).toMatch(/ผ่านไปแล้ว/);
    expect(q('โทรหาลูกค้า 14:00').pastWarning).toBeNull();
  });
  it('ไม่มีชื่อ = บันทึกไม่ได้', () => {
    expect(buildQuickPayload(q('พรุ่งนี้ 14:00'))).toEqual({ error: 'พิมพ์ชื่องานก่อน' });
    expect(buildQuickPayload(q('   '))).toEqual({ error: 'พิมพ์ชื่องานก่อน' });
  });
});

describe('แก้ชิปก่อน Enter (overrides) และบันทึกตามที่แก้', () => {
  it('แก้วัน/เวลา/สำคัญ/ระยะเวลา ทับผลจาก parser', () => {
    const s = applyOverrides(q('ส่งรายงาน พรุ่งนี้ 14:00'), {
      when: { day: '2026-11-09', startTime: '09:30', duration: 60 },
      important: true,
    });
    const r = buildQuickPayload(s);
    expect('payload' in r && r.payload).toMatchObject({
      importance: 4,
      startAt: at('09:30', '2026-11-09'),
      endAt: at('10:30', '2026-11-09'),
    });
  });
  it('เอาเวลาออก = กลับเป็นงานทั้งวัน', () => {
    const s = applyOverrides(q('ส่งรายงาน พรุ่งนี้ 14:00'), { when: { startTime: '' } });
    const r = buildQuickPayload(s);
    expect('payload' in r && r.payload).toMatchObject({
      allDay: true,
      dueDate: '2026-11-06',
      startAt: null,
    });
  });
  it('ตรวจความถูกต้อง: เดดไลน์ก่อนเวลาเริ่ม = error ภาษาคน', () => {
    const s = applyOverrides(q('ประชุม 14:00'), {
      when: { deadlineOn: true, deadlineDate: TODAY, deadlineTime: '09:00' },
    });
    const r = buildQuickPayload(s);
    expect('error' in r && r.error).toMatch(/ก่อนเวลาเริ่ม/);
  });
});

describe('งานชั่วคราว (optimistic)', () => {
  it('สร้างจาก payload ได้ครบฟิลด์ พร้อม urgency ที่คำนวณจากวัน (วันนี้ = 4)', () => {
    const t = tmpTaskFromPayload(payload('ซื้อกาแฟ'), 'tmp-1', NOW);
    expect(t).toMatchObject({
      id: 'tmp-1',
      title: 'ซื้อกาแฟ',
      status: 'todo',
      urgency: 4,
      tags: [],
      attachmentCount: 0,
      snoozeCount: 0,
    });
    expect(tmpTaskFromPayload(payload('จัดโต๊ะ วันหลัง'), 'tmp-2', NOW).urgency).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { confirmAlternatives, parseTask } from '../src/services/parser';

// พุธ 4 พ.ย. 2026 เวลา 10:00 น. (ไทย) = 03:00Z
const NOW = new Date('2026-11-04T03:00:00Z');
const CATS = [
  { id: 'c-work', name: 'งาน' },
  { id: 'c-personal', name: 'ส่วนตัว' },
  { id: 'c-study', name: 'เรียน' },
];
const p = (s: string) => parseTask(s, NOW, CATS);

describe('parser: ตัวอย่างหลักของ spec', () => {
  it('ส่งรายงาน พรุ่งนี้ 14:00 #งาน !ด่วน', () => {
    const r = p('ส่งรายงาน พรุ่งนี้ 14:00 #งาน !ด่วน');
    expect(r).toMatchObject({
      title: 'ส่งรายงาน',
      date: '2026-11-05',
      time: '14:00',
      category: 'งาน',
      categoryId: 'c-work',
      urgency: 3,
    });
    expect(r.due).toBeUndefined();
    expect(r.needsConfirm).toBeUndefined();
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });
  it('ตัดส่วนที่จับได้ออกจาก title (เวลา/น./วันที่)', () => {
    expect(p('ประชุมทีม วันนี้ เวลา 14:00 น.').title).toBe('ประชุมทีม');
    expect(p('วันที่ 15 พ.ย. ไปงานแต่ง').title).toBe('ไปงานแต่ง');
  });
  it('ตัวเลขที่ไม่ใช่วัน/เวลาอยู่ใน title ต่อ', () => {
    const r = p('ซื้อนม 2 กล่อง พรุ่งนี้');
    expect(r.title).toBe('ซื้อนม 2 กล่อง');
    expect(r.date).toBe('2026-11-05');
    expect(p('ประชุม 3 ครั้ง').date).toBeUndefined();
  });
  it('ไม่มีวัน/เวลา → ไม่มี date (ไป Inbox) และ confidence ต่ำกว่า', () => {
    const r = p('ซื้อของเข้าบ้าน');
    expect(r.date).toBeUndefined();
    expect(r.time).toBeUndefined();
    expect(r.title).toBe('ซื้อของเข้าบ้าน');
    expect(r.confidence).toBeLessThan(p('ซื้อของเข้าบ้าน พรุ่งนี้').confidence);
  });
  it('title ว่างเมื่อมีแต่วัน/เวลา', () => {
    expect(p('พรุ่งนี้ 14:00').title).toBe('');
  });
});

describe('parser: วัน', () => {
  it.each([
    ['งาน วันนี้ 15:00', '2026-11-04'],
    ['งาน พรุ่งนี้', '2026-11-05'],
    ['งาน มะรืน', '2026-11-06'],
    ['งาน วันศุกร์', '2026-11-06'],
    ['งาน ศุกร์', '2026-11-06'],
    ['งาน วันพุธ', '2026-11-04'], // วันนี้เป็นวันพุธ = วันนี้
    ['งาน วันจันทร์', '2026-11-09'],
    ['งาน วันอาทิตย์', '2026-11-08'],
    ['งาน วันพฤหัสบดี', '2026-11-05'],
    ['งาน ศุกร์หน้า', '2026-11-13'], // "หน้า" = สัปดาห์ถัดไป
    ['งาน วันอาทิตย์หน้า', '2026-11-15'],
    ['งาน สัปดาห์หน้า', '2026-11-09'],
    ['งาน อาทิตย์หน้า', '2026-11-09'], // ไม่มี "วัน" = สัปดาห์หน้า
    ['งาน อีก 3 วัน', '2026-11-07'],
    ['งาน อีก 2 สัปดาห์', '2026-11-18'],
    ['งาน สิ้นเดือน', '2026-11-30'],
    ['งาน 15 พ.ย.', '2026-11-15'],
    ['งาน 15 พฤศจิกายน', '2026-11-15'],
    ['งาน 15/11', '2026-11-15'],
    ['งาน 20 ธ.ค.', '2026-12-20'],
  ])('%s → %s', (text, date) => {
    expect(p(text).date).toBe(date);
  });
  it('ปี พ.ศ. แปลงเป็น ค.ศ. (ปี > 2400)', () => {
    expect(p('งาน 15 พ.ย. 2569').date).toBe('2026-11-15');
    expect(p('งาน 1/1/2570').date).toBe('2027-01-01');
    expect(p('งาน 15 มกราคม 2570').date).toBe('2027-01-15');
    expect(p('งาน 15/11/2026').date).toBe('2026-11-15');
  });
  it('วันที่ไม่มีจริงไม่ถูกตีความเป็นวัน', () => {
    expect(p('ขอ 32/13').date).toBeUndefined();
    expect(p('งาน 31 ก.พ.').date).toBeUndefined();
  });
});

describe('parser: เวลา', () => {
  it.each([
    ['งาน พรุ่งนี้ 14:00', '14:00'],
    ['งาน พรุ่งนี้ 14.30', '14:30'],
    ['งาน พรุ่งนี้ 9:05 น.', '09:05'],
    ['งาน พรุ่งนี้ 2 โมงเช้า', '08:00'], // ระบบ 6 ชั่วโมงแบบไทย
    ['งาน พรุ่งนี้ 7 โมงเช้า', '07:00'],
    ['งาน พรุ่งนี้ 10 โมงเช้า', '10:00'],
    ['งาน พรุ่งนี้ บ่าย 2', '14:00'],
    ['งาน พรุ่งนี้ บ่ายสองโมง', '14:00'],
    ['งาน พรุ่งนี้ บ่ายโมง', '13:00'],
    ['งาน พรุ่งนี้ บ่าย 2 โมงครึ่ง', '14:30'],
    ['งาน พรุ่งนี้ 4 โมงเย็น', '16:00'],
    ['งาน พรุ่งนี้ เย็น 5 โมง', '17:00'],
    ['งาน พรุ่งนี้ 4 ทุ่ม', '22:00'],
    ['งาน พรุ่งนี้ สี่ทุ่ม', '22:00'],
    ['งาน พรุ่งนี้ 1 ทุ่ม', '19:00'],
    ['งาน พรุ่งนี้ เที่ยง', '12:00'],
    ['งาน พรุ่งนี้ เที่ยงคืน', '00:00'],
    ['งาน พรุ่งนี้ ตี 5', '05:00'],
    ['งาน พรุ่งนี้ ตีห้า', '05:00'],
    ['งาน พรุ่งนี้ 14 น.', '14:00'],
    ['งาน พรุ่งนี้ 9 โมง', '09:00'],
    ['งาน พรุ่งนี้ 2 โมง', '14:00'], // ไม่ระบุช่วง: 1–5 โมง = บ่าย
  ])('%s → %s', (text, time) => {
    expect(p(text).time).toBe(time);
  });
  it('ช่วงเวลา 14:00-15:30', () => {
    const r = p('ประชุม พรุ่งนี้ 14:00-15:30');
    expect(r).toMatchObject({ title: 'ประชุม', time: '14:00', endTime: '15:30' });
  });
  it('มีเวลาแต่ไม่มีวัน → วันนี้ (เมื่อเวลายังไม่ผ่าน)', () => {
    const r = p('โทรหาลูกค้า 15:00');
    expect(r).toMatchObject({ date: '2026-11-04', time: '15:00' });
    expect(r.needsConfirm).toBeUndefined();
  });
});

describe('parser: เดดไลน์', () => {
  it('ภายใน 17:00 = เดดไลน์วันนี้ (ไม่ใช่เวลาเริ่ม)', () => {
    const r = p('ส่งรายงาน ภายใน 17:00');
    expect(r.due).toEqual({ date: '2026-11-04', time: '17:00' });
    expect(r.time).toBeUndefined();
    expect(r.date).toBeUndefined();
    expect(r.title).toBe('ส่งรายงาน');
  });
  it('เดดไลน์ ศุกร์ 17:00 (ทั้งวัน+เวลาเป็นเดดไลน์)', () => {
    const r = p('ทำสไลด์ เดดไลน์ ศุกร์ 17:00');
    expect(r.due).toEqual({ date: '2026-11-06', time: '17:00' });
    expect(r.date).toBeUndefined();
    expect(r.title).toBe('ทำสไลด์');
  });
  it('ส่งภายใน + วันที่อย่างเดียว', () => {
    const r = p('ส่งใบเสนอราคา ส่งภายใน พรุ่งนี้');
    expect(r.due).toEqual({ date: '2026-11-05', time: undefined });
    expect(r.title).toBe('ส่งใบเสนอราคา');
  });
  it('พรุ่งนี้ ก่อน 17:00 → วันที่ใช้กับเดดไลน์', () => {
    const r = p('ส่งงาน พรุ่งนี้ ก่อน 17:00');
    expect(r.due).toEqual({ date: '2026-11-05', time: '17:00' });
    expect(r.date).toBeUndefined();
  });
  it('มีทั้งเวลาเริ่มและเดดไลน์', () => {
    const r = p('ประชุม พรุ่งนี้ 10:00 ภายใน 17:00');
    expect(r).toMatchObject({
      date: '2026-11-05',
      time: '10:00',
      due: { date: '2026-11-05', time: '17:00' },
    });
  });
  it('คำบอกเดดไลน์ติดกับคำก่อนหน้า และ due ภาษาอังกฤษ', () => {
    expect(p('ส่งรายงานภายในศุกร์ 17:00')).toMatchObject({
      title: 'ส่งรายงาน',
      due: { date: '2026-11-06', time: '17:00' },
    });
    expect(p('Report due 17:00').due).toEqual({ date: '2026-11-04', time: '17:00' });
  });
  it('"ก่อน" ใน title ที่ไม่ได้ตามด้วยวัน/เวลา ไม่ถือเป็นเดดไลน์', () => {
    const r = p('อ่านหนังสือก่อนนอน');
    expect(r.due).toBeUndefined();
    expect(r.title).toBe('อ่านหนังสือก่อนนอน');
  });
});

describe('parser: ธง ประเภท แท็ก ระยะเวลา', () => {
  it('ความเร่งด่วน / ความสำคัญ', () => {
    expect(p('x !ด่วน').urgency).toBe(3);
    expect(p('x !ด่วนมาก').urgency).toBe(4);
    expect(p('x !u1').urgency).toBe(1);
    expect(p('x !U4').urgency).toBe(4);
    expect(p('x !สำคัญ').importance).toBe(3);
    expect(p('x !สำคัญมาก').importance).toBe(4);
    expect(p('x !p2').importance).toBe(2);
    const both = p('รายงาน !ด่วนมาก !p4');
    expect(both).toMatchObject({ urgency: 4, importance: 4, title: 'รายงาน' });
  });
  it('ประเภท: ตรงชื่อ, fuzzy (ขึ้นต้น), ไม่พบ → กลายเป็นแท็ก', () => {
    expect(p('x #ส่วนตัว').categoryId).toBe('c-personal');
    expect(p('x #ส่วน').categoryId).toBe('c-personal');
    const unknown = p('x #ช้อปปิ้ง');
    expect(unknown.categoryId).toBeUndefined();
    expect(unknown.tags).toContain('ช้อปปิ้ง');
    expect(unknown.title).toBe('x');
  });
  it('แท็ก @', () => {
    expect(p('ซ่อมรถ @ครอบครัว @urgent').tags).toEqual(['ครอบครัว', 'urgent']);
  });
  it('ระยะเวลา', () => {
    expect(p('x 2 ชม.').estimateMinutes).toBe(120);
    expect(p('x 30 นาที').estimateMinutes).toBe(30);
    expect(p('x 1.5 ชั่วโมง').estimateMinutes).toBe(90);
    expect(p('x ครึ่งชั่วโมง').estimateMinutes).toBe(30);
    expect(p('x 2 ชม. 30 นาที').estimateMinutes).toBe(150);
    expect(p('x 2 ชม. 30 นาที').title).toBe('x');
  });
  it('ระยะเวลาไม่ถูกมองเป็นเวลานาฬิกา', () => {
    const r = p('เขียนโค้ด พรุ่งนี้ 14:00 2 ชม.');
    expect(r).toMatchObject({ time: '14:00', estimateMinutes: 120, title: 'เขียนโค้ด' });
  });
});

describe('parser: ทำซ้ำ', () => {
  it('ทุกวัน / ทุกสัปดาห์ / ทุกเดือน', () => {
    expect(p('ออกกำลังกาย ทุกวัน').recurrence).toBe('FREQ=DAILY');
    expect(p('สรุปงาน ทุกสัปดาห์').recurrence).toBe('FREQ=WEEKLY');
    expect(p('จ่ายค่าเช่า ทุกเดือน').recurrence).toBe('FREQ=MONTHLY');
    expect(p('ออกกำลังกาย ทุกวัน').title).toBe('ออกกำลังกาย');
  });
  it('ทุกวันจันทร์ → WEEKLY;BYDAY และวันเริ่ม = จันทร์ถัดไป', () => {
    const r = p('ประชุมทีม ทุกวันจันทร์ 9:00');
    expect(r).toMatchObject({
      recurrence: 'FREQ=WEEKLY;BYDAY=MO',
      date: '2026-11-09',
      time: '09:00',
      title: 'ประชุมทีม',
    });
  });
  it('ทุกวันอังคาร 18:00 และงานทำซ้ำไม่ถามยืนยันเรื่องเวลาที่ผ่านมา', () => {
    const r = p('ซ้อมดนตรี ทุกวันอังคาร 18:00');
    expect(r).toMatchObject({
      recurrence: 'FREQ=WEEKLY;BYDAY=TU',
      date: '2026-11-10',
      time: '18:00',
    });
    const today = p('ฝึกพูด ทุกวัน 09:00');
    expect(today.needsConfirm).toBeUndefined();
  });
});

describe('parser: วัน/เวลาที่ผ่านมาแล้ว → ถามยืนยัน', () => {
  it('เวลาวันนี้ที่ผ่านไปแล้ว', () => {
    const r = p('ส่งรายงาน วันนี้ 09:00');
    expect(r.needsConfirm).toMatchObject({ reason: 'past_time', date: '2026-11-04' });
    const alt = confirmAlternatives('ส่งรายงาน วันนี้ 09:00', r);
    expect(alt[0]).toEqual({ label: 'เลื่อนเป็นพรุ่งนี้', text: 'ส่งรายงาน พรุ่งนี้ 09:00' });
    expect(alt[1]!.text).toBe('ส่งรายงาน วันนี้ 09:00 !ok');
  });
  it('เวลาผ่านไปแล้วโดยไม่ระบุวัน → เสนอเลื่อนเป็นพรุ่งนี้', () => {
    const text = 'โทรหาแม่ 08:00';
    const alt = confirmAlternatives(text, p(text));
    expect(p(text).needsConfirm?.reason).toBe('past_time');
    expect(alt[0]!.text).toBe('โทรหาแม่ 08:00 พรุ่งนี้');
  });
  it('วันที่ผ่านมาแล้ว (ไม่ระบุปี) → เสนอปีหน้าเป็น พ.ศ.', () => {
    const text = 'ประชุม 3 พ.ย.';
    const r = p(text);
    expect(r.needsConfirm).toMatchObject({ reason: 'past_date', explicitYear: false });
    const alt = confirmAlternatives(text, r);
    expect(alt[0]).toEqual({ label: 'ใช้ปี 2570', text: 'ประชุม 3 พ.ย. 2570' });
    expect(p(alt[0]!.text).date).toBe('2027-11-03');
    expect(p(alt[0]!.text).needsConfirm).toBeUndefined();
  });
  it('ระบุปีที่ผ่านมาชัดเจน → ไม่เสนอปีหน้า มีแค่ "บันทึกตามเดิม"', () => {
    const r = p('ประชุม 3 พ.ย. 2568');
    expect(r.needsConfirm?.explicitYear).toBe(true);
    expect(confirmAlternatives('ประชุม 3 พ.ย. 2568', r).map((a) => a.label)).toEqual([
      'บันทึกตามเดิม',
    ]);
  });
  it('!ok ข้ามการถามยืนยัน', () => {
    const r = p('ส่งรายงาน วันนี้ 09:00 !ok');
    expect(r.needsConfirm).toBeUndefined();
    expect(r.confirmed).toBe(true);
    expect(r.title).toBe('ส่งรายงาน');
  });
  it('วันนี้ทั้งวัน และเวลาที่ยังไม่ถึง ไม่ถามยืนยัน', () => {
    expect(p('งาน วันนี้').needsConfirm).toBeUndefined();
    expect(p('งาน วันนี้ 10:00').needsConfirm).toBeUndefined(); // เท่ากับเวลาปัจจุบัน ไม่ถือว่าผ่าน
    expect(p('งาน วันนี้ 11:00').needsConfirm).toBeUndefined();
  });
  it('เดดไลน์ที่ผ่านไปแล้วก็ถามยืนยัน', () => {
    expect(p('ส่งงาน ภายใน 09:00').needsConfirm?.reason).toBe('past_time');
  });
});

describe('parser: รวมหลายส่วน', () => {
  it('ทุกส่วนพร้อมกัน', () => {
    const r = p('เตรียมสไลด์ 20 พ.ย. 14:00-16:00 #งาน !u4 !p3 @ลูกค้า 2 ชม.');
    expect(r).toMatchObject({
      title: 'เตรียมสไลด์',
      date: '2026-11-20',
      time: '14:00',
      endTime: '16:00',
      categoryId: 'c-work',
      urgency: 4,
      importance: 3,
      tags: ['ลูกค้า'],
      estimateMinutes: 120,
    });
  });
  it('ไม่มี categories ที่ให้มา ก็ยังได้ชื่อประเภทดิบ', () => {
    const r = parseTask('x #งาน', NOW);
    expect(r.category).toBe('งาน');
    expect(r.categoryId).toBeUndefined();
  });
  it('ข้อความว่าง/ช่องว่างล้วนไม่ crash', () => {
    expect(p('   ').title).toBe('');
    expect(p('').tags).toEqual([]);
  });
  it('ไม่ตีความ "14.5" ที่ตามด้วยหน่วยอื่นเป็นเวลา (เช่น เงิน)', () => {
    expect(p('จ่ายค่าไฟ 1.50 บาท').time).toBeUndefined();
  });
});

describe('Quick Add: คำที่พิมพ์ได้โดยไม่ต้องมี !', () => {
  const NOWQ = new Date('2026-11-04T03:00:00Z'); // พุธ 4 พ.ย. 10:00 ไทย
  it('"สำคัญ" เป็นคำเดี่ยวท้ายข้อความ = ติ๊กสำคัญ และถูกตัดออกจากชื่อ', () => {
    const p = parseTask('ส่งรายงาน พรุ่งนี้ 14:00 สำคัญ', NOWQ);
    expect(p.title).toBe('ส่งรายงาน');
    expect(p.date).toBe('2026-11-05');
    expect(p.time).toBe('14:00');
    expect(p.importance).toBe(3);
  });
  it('"สำคัญมาก" / ⭐ นำหน้าหรือท้ายก็ได้; "!สำคัญ" แบบเดิมยังใช้ได้', () => {
    expect(parseTask('จ่ายค่าไฟ สำคัญมาก', NOWQ)).toMatchObject({
      title: 'จ่ายค่าไฟ',
      importance: 4,
    });
    expect(parseTask('⭐ โทรหาลูกค้า', NOWQ)).toMatchObject({
      title: 'โทรหาลูกค้า',
      importance: 3,
    });
    expect(parseTask('โทรหาลูกค้า ⭐', NOWQ)).toMatchObject({
      title: 'โทรหาลูกค้า',
      importance: 3,
    });
    expect(parseTask('โทรหาลูกค้า !สำคัญ', NOWQ)).toMatchObject({
      title: 'โทรหาลูกค้า',
      importance: 3,
    });
  });
  it('คำว่า "สำคัญ" ที่เป็นส่วนของชื่อ หรือเป็นชื่อทั้งหมด ไม่ถูกตัดทิ้ง', () => {
    expect(parseTask('ประชุมสำคัญ', NOWQ)).toMatchObject({ title: 'ประชุมสำคัญ' });
    expect(parseTask('ประชุมสำคัญ', NOWQ).importance).toBeUndefined();
    expect(parseTask('สำคัญ', NOWQ)).toMatchObject({ title: 'สำคัญ' });
    expect(parseTask('เรื่องสำคัญ ที่ต้องทำ', NOWQ).title).toBe('เรื่องสำคัญ ที่ต้องทำ');
  });
  it('"วันหลัง" / "สักวัน" / "ไว้ทีหลัง" = ไม่เร่ง (someday) และถูกตัดออกจากชื่อ', () => {
    for (const w of ['วันหลัง', 'สักวัน', 'ไว้ทีหลัง']) {
      const p = parseTask(`จัดโต๊ะทำงาน ${w}`, NOWQ);
      expect(p.title).toBe('จัดโต๊ะทำงาน');
      expect(p.someday).toBe(true);
      expect(p.date).toBeUndefined();
    }
    expect(parseTask('จัดโต๊ะ', NOWQ).someday).toBeUndefined();
  });
});

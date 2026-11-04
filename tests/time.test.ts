import { afterEach, describe, expect, it } from 'vitest';
import { addDays, bangkokDate, bangkokHm, freezeNow, fromBangkok, now } from '../src/lib/time';

afterEach(() => freezeNow(null));

describe('time (Asia/Bangkok)', () => {
  it('แปลง UTC เป็นวันที่/เวลาไทย ข้ามวันได้ถูกต้อง', () => {
    freezeNow(new Date('2026-11-04T18:30:00Z')); // 01:30 วันถัดไปในไทย
    expect(bangkokDate()).toBe('2026-11-05');
    expect(bangkokHm()).toBe('01:30');
  });
  it('fromBangkok เป็นส่วนกลับของ bangkokDate/Hm', () => {
    const d = fromBangkok('2026-11-05', '14:00');
    expect(d.toISOString()).toBe('2026-11-05T07:00:00.000Z');
    expect(bangkokHm(d)).toBe('14:00');
  });
  it('addDays ข้ามเดือน/ปี', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('freezeNow ทำงาน', () => {
    freezeNow(new Date('2026-01-01T00:00:00Z'));
    expect(now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

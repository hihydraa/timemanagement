import { describe, expect, it } from 'vitest';
import { defaultReviewWeek, weekLabel } from '../apps/web/src/lib/dates';
import { isSparse, yTicks } from '../apps/web/src/lib/chart';
import { contrast, pastel } from '../apps/web/src/lib/colors';
import { formatTimeRange, isPointInTime, timeLeft } from '../apps/web/src/lib/time';
import { completionOf } from '../src/services/stats';

describe('6.5 นิยามอัตราสำเร็จ (ฟังก์ชันเดียว)', () => {
  it('เสร็จ ÷ กำหนดไว้ และไม่มีงานให้คำนวณ = null (ไม่ใช่ 0%)', () => {
    expect(completionOf([])).toEqual({ scheduled: 0, scheduledDone: 0, completionRate: null });
    const r = completionOf([{ status: 'done' }, { status: 'todo' }, { status: 'doing' }]);
    expect(r).toEqual({ scheduled: 3, scheduledDone: 1, completionRate: 33.3 });
    expect(completionOf([{ status: 'done' }]).completionRate).toBe(100);
  });
});

describe('6.2 จุดเวลา (เริ่ม = จบ)', () => {
  const at = '2026-11-04T09:37:00.000Z'; // 16:37 เวลาไทย
  it('แสดงเวลาเดียว ไม่ใช่ "16:37–16:37"', () => {
    expect(formatTimeRange({ allDay: false, startAt: at, endAt: at, dueAt: null })).toBe('16:37');
    expect(
      formatTimeRange({
        allDay: false,
        startAt: at,
        endAt: '2026-11-04T10:37:00.000Z',
        dueAt: null,
      }),
    ).toBe('16:37–17:37');
  });
  it('ตรวจจุดเวลา: จบ = เริ่ม หรือไม่มีจบและไม่มีเวลาประมาณ', () => {
    expect(isPointInTime({ startAt: at, endAt: at, estimateMinutes: null })).toBe(true);
    expect(isPointInTime({ startAt: at, endAt: null, estimateMinutes: null })).toBe(true);
    expect(isPointInTime({ startAt: at, endAt: null, estimateMinutes: 45 })).toBe(false);
    expect(
      isPointInTime({ startAt: at, endAt: '2026-11-04T10:00:00.000Z', estimateMinutes: null }),
    ).toBe(false);
    expect(isPointInTime({ startAt: null, endAt: null, estimateMinutes: null })).toBe(false);
  });
});

describe('ชิปนับถอยหลังเดดไลน์', () => {
  const now = Date.parse('2026-11-04T03:00:00Z'); // 10:00 เวลาไทย
  it('อีก/เลยมา และสีเมื่อใกล้/เลย', () => {
    const a = timeLeft({ dueAt: '2026-11-04T05:00:00Z', dueDate: null, status: 'todo' }, now);
    expect(a).toEqual({ text: 'อีก 2 ชม.', overdue: false, urgent: true });
    const b = timeLeft({ dueAt: '2026-11-03T03:00:00Z', dueDate: null, status: 'todo' }, now);
    expect(b).toEqual({ text: 'เลยมา 1 วัน', overdue: true, urgent: true });
    expect(
      timeLeft({ dueAt: '2026-11-04T03:20:00Z', dueDate: null, status: 'todo' }, now)?.text,
    ).toBe('อีก 20 นาที');
    expect(
      timeLeft({ dueAt: '2026-11-10T03:00:00Z', dueDate: null, status: 'todo' }, now)?.urgent,
    ).toBe(false);
  });
  it('เดดไลน์ทั้งวัน = สิ้นสุดวันนั้น; เสร็จ/ยกเลิก/ไม่มีเดดไลน์ = ไม่แสดง', () => {
    expect(timeLeft({ dueAt: null, dueDate: '2026-11-04', status: 'todo' }, now)?.overdue).toBe(
      false,
    );
    expect(
      timeLeft({ dueAt: '2026-11-04T05:00:00Z', dueDate: null, status: 'done' }, now),
    ).toBeNull();
    expect(timeLeft({ dueAt: null, dueDate: null, status: 'todo' }, now)).toBeNull();
  });
});

describe('6.3 สัปดาห์เริ่มต้นของหน้ารีวิว', () => {
  it('จ–พ = สัปดาห์ที่แล้ว, พฤ–อา = สัปดาห์นี้', () => {
    expect(defaultReviewWeek('2026-11-02')).toBe('2026-10-26'); // จันทร์
    expect(defaultReviewWeek('2026-11-04')).toBe('2026-10-26'); // พุธ
    expect(defaultReviewWeek('2026-11-05')).toBe('2026-11-02'); // พฤหัส
    expect(defaultReviewWeek('2026-11-08')).toBe('2026-11-02'); // อาทิตย์
  });
  it('ป้ายสัปดาห์ระบุชัดเจน', () => {
    const today = '2026-11-04';
    expect(weekLabel('2026-11-02', today)).toBe('สัปดาห์นี้');
    expect(weekLabel('2026-10-26', today)).toBe('สัปดาห์ที่แล้ว');
    expect(weekLabel('2026-11-09', today)).toBe('สัปดาห์หน้า');
    expect(weekLabel('2026-10-19', today)).toMatch(/^สัปดาห์ของ /);
  });
});

describe('6.1 แกน Y ของกราฟ', () => {
  it('tick เป็นจำนวนเต็มไม่ซ้ำ (ไม่เกิด 1,1,0)', () => {
    for (const max of [0, 0.5, 1, 2, 3, 4, 5, 7, 12, 100]) {
      const t = yTicks(max);
      expect(new Set(t).size).toBe(t.length);
      expect(t.every(Number.isInteger)).toBe(true);
      expect(t[0]).toBe(0);
      expect(t[t.length - 1]).toBeGreaterThanOrEqual(Math.ceil(max));
    }
    expect(yTicks(1)).toEqual([0, 1]);
  });
  it('ข้อมูลน้อย (≤14 วัน เสร็จ ≤3 วัน) ใช้ heatmap', () => {
    const d = (n: number) => Array.from({ length: n }, (_, i) => ({ completed: i < 2 ? 1 : 0 }));
    expect(isSparse(d(7))).toBe(true);
    expect(isSparse(d(30))).toBe(false);
    expect(isSparse(Array.from({ length: 7 }, () => ({ completed: 2 })))).toBe(false);
  });
});

describe('สี event แบบพาสเทล', () => {
  it('ตัวอักษรบนพื้น event ผ่าน contrast ≥ 4.5 (AA) ทุกสีของระบบ', () => {
    const colors = [
      '#3b82f6',
      '#a855f7',
      '#14b8a6',
      '#22c55e',
      '#ca8a04',
      '#ec4899',
      '#64748b',
      '#dc2626',
      '#eab308',
      '#9ca3af',
      '#1d4ed8',
    ];
    for (const c of colors) {
      const p = pastel(c);
      expect(contrast(p.text, p.bg), c).toBeGreaterThanOrEqual(4.5);
    }
  });
});

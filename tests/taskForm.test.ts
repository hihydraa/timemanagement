import { describe, expect, it } from 'vitest';
import {
  emptyWhen,
  summarizeWhen,
  validateWhen,
  whenFromTask,
  whenToPayload,
  type WhenForm,
} from '../apps/web/src/lib/taskForm';

const TODAY = '2026-11-05';
const at = (hm: string, d = TODAY) => new Date(`${d}T${hm}:00+07:00`).toISOString();
const w = (o: Partial<WhenForm> = {}): WhenForm => ({ ...emptyWhen(TODAY), ...o });

describe('ค่าเริ่มต้นของฟอร์ม', () => {
  it('งานใหม่ = วันนี้ ไม่กำหนดเวลา 30 นาที ไม่มีเดดไลน์ (ไม่ต้องกรอกอะไรเลยก็บันทึกได้)', () => {
    expect(emptyWhen(TODAY)).toEqual({
      day: TODAY,
      startTime: '',
      duration: 30,
      deadlineOn: false,
      deadlineDate: TODAY,
      deadlineTime: '',
    });
    expect(whenToPayload(emptyWhen(TODAY))).toEqual({
      allDay: true,
      startAt: null,
      endAt: null,
      dueAt: null,
      dueDate: TODAY,
      estimateMinutes: 30,
    });
  });
});

describe('แปลงฟอร์ม → งาน', () => {
  it('เลือกแค่เวลาเริ่ม (24 ชม.) → วันนี้ + เวลา, สิ้นสุด = เริ่ม + ระยะเวลา (ไม่ต้องกรอกเวลาสิ้นสุด)', () => {
    const p = whenToPayload(w({ startTime: '14:00', duration: 90 }));
    expect(p).toEqual({
      allDay: false,
      startAt: at('14:00'),
      endAt: at('15:30'),
      dueAt: null,
      dueDate: null,
      estimateMinutes: 90,
    });
  });
  it('ข้ามเที่ยงคืนเมื่อสิ้นสุดเลยวัน และใช้เวลาไทยไม่ใช่ UTC', () => {
    const p = whenToPayload(w({ startTime: '23:30', duration: 60 }));
    expect(p.startAt).toBe('2026-11-05T16:30:00.000Z');
    expect(p.endAt).toBe('2026-11-05T17:30:00.000Z'); // 00:30 ไทยของวันที่ 6
  });
  it('มีเวลา + เดดไลน์: เก็บ dueAt (ไม่มีเวลาเดดไลน์ = สิ้นวัน 23:59)', () => {
    const a = whenToPayload(
      w({
        startTime: '09:00',
        deadlineOn: true,
        deadlineDate: '2026-11-06',
        deadlineTime: '17:00',
      }),
    );
    expect(a.dueAt).toBe(at('17:00', '2026-11-06'));
    expect(a.startAt).toBe(at('09:00'));
    const b = whenToPayload(
      w({ startTime: '09:00', deadlineOn: true, deadlineDate: '2026-11-06' }),
    );
    expect(b.dueAt).toBe(at('23:59', '2026-11-06'));
  });
  it('ไม่มีเวลา แต่มีเดดไลน์ → งานเดดไลน์ที่ยังไม่จัดเวลา (dueAt อย่างเดียว)', () => {
    const p = whenToPayload(
      w({ deadlineOn: true, deadlineDate: '2026-11-08', deadlineTime: '12:00' }),
    );
    expect(p).toEqual({
      allDay: false,
      startAt: null,
      endAt: null,
      dueAt: at('12:00', '2026-11-08'),
      dueDate: null,
      estimateMinutes: 30,
    });
  });
  it('ไม่ระบุวัน ไม่มีเดดไลน์ → ยังไม่มีวัน (ไป "ยังไม่จัดเวลา")', () => {
    expect(whenToPayload(w({ day: '' }))).toEqual({
      allDay: false,
      startAt: null,
      endAt: null,
      dueAt: null,
      dueDate: null,
      estimateMinutes: 30,
    });
  });
  it('ระยะเวลาผิดปกติถูกจำกัด (ต่ำกว่า 1 → 30, เกิน 1440 → 1440)', () => {
    expect(whenToPayload(w({ duration: 0 })).estimateMinutes).toBe(30);
    expect(whenToPayload(w({ duration: NaN })).estimateMinutes).toBe(30);
    expect(whenToPayload(w({ duration: 99999 })).estimateMinutes).toBe(1440);
  });
});

describe('ตรวจความถูกต้อง', () => {
  it('เวลาต้องเป็น 24 ชม. HH:mm; มีเวลาต้องมีวัน; เดดไลน์ต้องมีวัน/ไม่ก่อนเวลาเริ่ม', () => {
    expect(validateWhen(w())).toBeNull();
    expect(validateWhen(w({ startTime: '09:00' }))).toBeNull();
    expect(validateWhen(w({ startTime: '24:00' }))).toMatch(/เวลาเริ่ม/);
    expect(validateWhen(w({ startTime: '9:00' }))).toMatch(/เวลาเริ่ม/);
    expect(validateWhen(w({ day: '', startTime: '09:00' }))).toMatch(/เลือกวัน/);
    expect(validateWhen(w({ deadlineOn: true, deadlineDate: '' }))).toMatch(/เดดไลน์/);
    expect(validateWhen(w({ deadlineOn: true, deadlineTime: '99:99' }))).toMatch(/เวลาเดดไลน์/);
    expect(
      validateWhen(
        w({ startTime: '10:00', deadlineOn: true, deadlineDate: TODAY, deadlineTime: '09:00' }),
      ),
    ).toMatch(/ก่อนเวลาเริ่ม/);
    expect(
      validateWhen(
        w({ startTime: '10:00', deadlineOn: true, deadlineDate: TODAY, deadlineTime: '10:00' }),
      ),
    ).toBeNull();
  });
});

describe('แปลงงานเดิม → ฟอร์ม (แก้ไข) และกลับได้ครบ (round trip)', () => {
  const roundTrip = (t: Parameters<typeof whenFromTask>[0]) =>
    whenToPayload(whenFromTask(t, undefined, TODAY));
  it('งานมีเวลา + เดดไลน์', () => {
    const t = {
      allDay: false,
      startAt: at('13:00'),
      endAt: at('14:30'),
      dueAt: at('17:00', '2026-11-06'),
      dueDate: null,
      estimateMinutes: 90,
    };
    expect(whenFromTask(t, undefined, TODAY)).toMatchObject({
      day: TODAY,
      startTime: '13:00',
      duration: 90,
      deadlineOn: true,
      deadlineDate: '2026-11-06',
      deadlineTime: '17:00',
    });
    expect(roundTrip(t)).toMatchObject({ startAt: t.startAt, endAt: t.endAt, dueAt: t.dueAt });
  });
  it('งานทั้งวัน / เดดไลน์อย่างเดียว / ไม่มีวัน คงเดิม', () => {
    const allDay = {
      allDay: true,
      startAt: null,
      endAt: null,
      dueAt: null,
      dueDate: '2026-11-09',
      estimateMinutes: null,
    };
    expect(roundTrip(allDay)).toMatchObject({ allDay: true, dueDate: '2026-11-09' });
    const due = {
      allDay: false,
      startAt: null,
      endAt: null,
      dueAt: at('23:59', '2026-11-07'),
      dueDate: null,
      estimateMinutes: 45,
    };
    const f = whenFromTask(due, undefined, TODAY);
    expect(f).toMatchObject({
      day: '',
      deadlineOn: true,
      deadlineDate: '2026-11-07',
      deadlineTime: '',
      duration: 45,
    });
    expect(roundTrip(due).dueAt).toBe(due.dueAt);
    const none = {
      allDay: false,
      startAt: null,
      endAt: null,
      dueAt: null,
      dueDate: null,
      estimateMinutes: null,
    };
    expect(whenFromTask(none, undefined, TODAY).day).toBe('');
  });
  it('งานจุดเวลา (เริ่ม = จบ) ใช้ estimate/30 นาทีเป็นระยะเวลา ไม่ให้เป็น 0', () => {
    const t = {
      allDay: false,
      startAt: at('16:37'),
      endAt: at('16:37'),
      dueAt: null,
      dueDate: null,
      estimateMinutes: null,
    };
    expect(whenFromTask(t, undefined, TODAY).duration).toBe(30);
  });
  it('prefill จากปฏิทิน: ช่วงเวลาที่เลือก / วันเดียว', () => {
    expect(
      whenFromTask(
        undefined,
        { allDay: false, startInput: '2026-11-06T10:00', endInput: '2026-11-06T11:30' },
        TODAY,
      ),
    ).toMatchObject({ day: '2026-11-06', startTime: '10:00', duration: 90 });
    expect(whenFromTask(undefined, { allDay: true, date: '2026-11-07' }, TODAY)).toMatchObject({
      day: '2026-11-07',
      startTime: '',
    });
    expect(whenFromTask(undefined, { allDay: false }, TODAY).day).toBe(TODAY);
  });
});

describe('บรรทัดสรุป', () => {
  const label = (d: string) => `วันที่ ${d.slice(8)}`;
  it('แสดงสิ่งที่จะบันทึกจริง', () => {
    expect(summarizeWhen(w(), label)).toBe('วันที่ 05 (ไม่กำหนดเวลา)');
    expect(summarizeWhen(w({ startTime: '14:00', duration: 30 }), label)).toBe(
      'วันที่ 05 14:00–14:30',
    );
    expect(summarizeWhen(w({ startTime: '23:45', duration: 30 }), label)).toBe(
      'วันที่ 05 23:45–00:15',
    );
    expect(
      summarizeWhen(
        w({ day: '', deadlineOn: true, deadlineDate: '2026-11-08', deadlineTime: '17:00' }),
        label,
      ),
    ).toBe('เดดไลน์ วันที่ 08 17:00');
    expect(summarizeWhen(w({ day: '' }), label)).toBe('ยังไม่กำหนดวัน');
    expect(
      summarizeWhen(w({ startTime: '09:00', deadlineOn: true, deadlineDate: '2026-11-06' }), label),
    ).toBe('วันที่ 05 09:00–09:30 · เดดไลน์ วันที่ 06 (สิ้นวัน)');
  });
});

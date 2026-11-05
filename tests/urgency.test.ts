import { describe, expect, it } from 'vitest';
import { computeUrgency } from '../src/lib/urgency';
import { Client, makeEnv } from './helpers/app';
import { freezeNow } from '../src/lib/time';

// พุธ 4 พ.ย. 2569 10:00 เวลาไทย
const NOW = new Date('2026-11-04T03:00:00Z');
const at = (hm: string, d = '2026-11-04') => new Date(`${d}T${hm}:00+07:00`).toISOString();
const u = (t: object, now = NOW) => computeUrgency(t, now);

describe('computeUrgency', () => {
  it('ไม่มีวันที่เกี่ยวข้อง = 1', () => {
    expect(u({})).toBe(1);
    expect(u({ dueAt: null, dueDate: null, startAt: null })).toBe(1);
  });
  it('เลยกำหนดหรือเป็นวันนี้ = 4', () => {
    expect(u({ dueDate: '2026-11-03' })).toBe(4);
    expect(u({ dueAt: at('08:00', '2026-10-01') })).toBe(4);
    expect(u({ dueDate: '2026-11-04' })).toBe(4);
    expect(u({ dueAt: at('23:30') })).toBe(4);
    expect(u({ startAt: at('15:00') })).toBe(4);
  });
  it('พรุ่งนี้ = 3', () => {
    expect(u({ dueDate: '2026-11-05' })).toBe(3);
    expect(u({ dueAt: at('00:10', '2026-11-05') })).toBe(3);
  });
  it('ภายใน 3 วัน = 2 (วันที่ 2 และ 3 นับจากวันนี้)', () => {
    expect(u({ dueDate: '2026-11-06' })).toBe(2);
    expect(u({ dueDate: '2026-11-07' })).toBe(2);
  });
  it('4 วันขึ้นไป = 1', () => {
    expect(u({ dueDate: '2026-11-08' })).toBe(1);
    expect(u({ startAt: at('09:00', '2027-01-01') })).toBe(1);
  });
  it('ลำดับความสำคัญของวัน: due_at ก่อน due_date ก่อน start_at', () => {
    expect(
      u({ dueAt: at('10:00', '2026-11-10'), dueDate: '2026-11-04', startAt: at('09:00') }),
    ).toBe(1);
    expect(u({ dueDate: '2026-11-10', startAt: at('09:00') })).toBe(1);
    expect(u({ startAt: at('09:00', '2026-11-05') })).toBe(3);
  });
  it('งานทั้งวัน (dueDate) นับตามวันนั้น', () => {
    expect(u({ dueDate: '2026-11-04' })).toBe(4);
  });
  it('ข้ามเที่ยงคืนเวลาไทย: 00:30 ไทยของวันที่ 5 = วันนี้ใหม่แล้ว (ไม่ใช่ตาม UTC)', () => {
    const afterMidnight = new Date('2026-11-04T17:30:00Z'); // 5 พ.ย. 00:30 ไทย
    expect(u({ dueDate: '2026-11-05' }, afterMidnight)).toBe(4);
    expect(u({ dueDate: '2026-11-06' }, afterMidnight)).toBe(3);
    // ก่อนเที่ยงคืน (23:30 ไทย = 16:30Z) ยังเป็นวันที่ 4
    const beforeMidnight = new Date('2026-11-04T16:30:00Z');
    expect(u({ dueDate: '2026-11-05' }, beforeMidnight)).toBe(3);
    expect(u({ dueAt: '2026-11-04T17:10:00Z' }, beforeMidnight)).toBe(3); // 00:10 ไทยของวันที่ 5
  });
  it('ข้ามเดือนและปี', () => {
    const nye = new Date('2026-12-31T03:00:00Z');
    expect(u({ dueDate: '2027-01-01' }, nye)).toBe(3);
    expect(u({ dueDate: '2027-01-03' }, nye)).toBe(2);
    expect(u({ dueDate: '2027-01-04' }, nye)).toBe(1);
  });
});

describe('API ส่ง urgency ที่คำนวณแล้ว (ไม่ใช้ค่าที่เก็บ)', () => {
  it('งานที่สร้างด้วย urgency=1 แต่เดดไลน์วันนี้ ถูกส่งออกเป็น 4 และเปลี่ยนตามวัน', async () => {
    freezeNow(NOW);
    const env = makeEnv();
    const c = new Client(env);
    await c.login('a@x.com');
    const t = (
      await c.call('POST', '/api/tasks', {
        title: 'x',
        urgency: 1,
        allDay: true,
        dueDate: '2026-11-04',
      })
    ).json.task;
    expect(t.urgency).toBe(4);
    freezeNow(new Date('2026-11-02T03:00:00Z')); // อีก 2 วันก่อนถึง
    expect((await c.call('GET', `/api/tasks/${t.id}`)).json.task.urgency).toBe(2);
    freezeNow(new Date('2026-10-20T03:00:00Z'));
    expect((await c.call('GET', `/api/tasks/${t.id}`)).json.task.urgency).toBe(1);
    const inbox = (await c.call('POST', '/api/tasks', { title: 'ไม่มีวัน', urgency: 4 })).json.task;
    expect(inbox.urgency).toBe(1);
    freezeNow(null);
  });
});

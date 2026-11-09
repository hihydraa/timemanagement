import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freezeNow } from '../src/lib/time';
import {
  importantScore,
  isMonth,
  monthRange,
  streak,
  summarizeDeadlines,
  weeklyDone,
} from '../src/services/dashboard';
import { Client, makeEnv } from './helpers/app';

const TODAY = '2026-11-12'; // พฤหัส
let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;
beforeEach(async () => {
  freezeNow(new Date(`${TODAY}T10:00:00+07:00`));
  env = makeEnv();
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
});
afterEach(() => freezeNow(null));

const mk = async (c: Client, body: object) =>
  (await c.call('POST', '/api/tasks', body)).json.task as { id: string };
const dash = async (c: Client, q = '') => (await c.call('GET', `/api/dashboard${q}`)).json;
const day = (d: string) => ({ allDay: true, dueDate: d });

describe('ฟังก์ชันคำนวณ', () => {
  it('monthRange / isMonth', () => {
    expect(monthRange('2026-11')).toEqual({ start: '2026-11-01', end: '2026-12-01' });
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', end: '2027-01-01' });
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('2026-1')).toBe(false);
    expect(isMonth(undefined)).toBe(false);
    expect(isMonth('2026-02')).toBe(true);
  });
  it('streak: นับต่อเนื่อง, วันนี้ยังไม่มีงานเสร็จไม่ตัดสตรีค, ขาดวันแล้วเริ่มใหม่', () => {
    expect(streak([], TODAY)).toBe(0);
    expect(streak(['2026-11-12', '2026-11-11', '2026-11-10'], TODAY)).toBe(3);
    expect(streak(['2026-11-11', '2026-11-10'], TODAY)).toBe(2);
    expect(streak(['2026-11-10'], TODAY)).toBe(0);
    expect(streak(['2026-11-12', '2026-11-10'], TODAY)).toBe(1);
  });
  it('weeklyDone: 8 สัปดาห์ เริ่มจันทร์ สัปดาห์ล่าสุด = สัปดาห์นี้', () => {
    const w = weeklyDone(['2026-11-09', '2026-11-12', '2026-11-08', '2026-09-01'], TODAY);
    expect(w).toHaveLength(8);
    expect(w[7]).toEqual({ weekStart: '2026-11-09', done: 2 });
    expect(w[6]).toEqual({ weekStart: '2026-11-02', done: 1 }); // อาทิตย์ 11-08 อยู่สัปดาห์ก่อน
    expect(w[0]!.weekStart).toBe('2026-09-21');
  });
  it('importantScore: urgency×2 + importance×2 + ความใกล้เดดไลน์', () => {
    const base = { urgency: 2, importance: 4, dueAt: null };
    expect(importantScore({ ...base, dueDate: null }, TODAY)).toBe(12);
    expect(importantScore({ ...base, dueDate: TODAY }, TODAY)).toBe(16);
    expect(importantScore({ ...base, dueDate: '2026-11-14' }, TODAY)).toBe(15);
    expect(importantScore({ ...base, dueDate: '2026-11-19' }, TODAY)).toBe(14);
    expect(importantScore({ ...base, dueDate: '2026-11-26' }, TODAY)).toBe(13);
    expect(importantScore({ ...base, dueDate: '2026-12-30' }, TODAY)).toBe(12);
  });
  it('summarizeDeadlines: อัตราเสร็จ/ตรงเวลา/ค้าง/ต่อวัน/ยกเลิกไม่นับ', () => {
    const r = summarizeDeadlines(
      [
        {
          status: 'done',
          dueAt: null,
          dueDate: '2026-11-05',
          completedAt: '2026-11-05T05:00:00.000Z',
          categoryId: 'c1',
        }, // ทัน
        {
          status: 'done',
          dueAt: null,
          dueDate: '2026-11-05',
          completedAt: '2026-11-07T05:00:00.000Z',
          categoryId: 'c1',
        }, // ช้า
        { status: 'todo', dueAt: null, dueDate: '2026-11-10', completedAt: null, categoryId: null }, // ค้าง
        {
          status: 'doing',
          dueAt: null,
          dueDate: '2026-11-20',
          completedAt: null,
          categoryId: null,
        },
        {
          status: 'cancelled',
          dueAt: null,
          dueDate: '2026-11-20',
          completedAt: null,
          categoryId: null,
        },
        {
          status: 'todo',
          dueAt: '2026-11-12T01:00:00.000Z',
          dueDate: null,
          completedAt: null,
          categoryId: null,
        }, // เดดไลน์เวลา 08:00 ผ่านแล้ว (10:00)
      ],
      TODAY,
      new Date(`${TODAY}T10:00:00+07:00`).toISOString(),
    );
    expect(r).toMatchObject({ open: 3, done: 2, overdue: 2, completionRate: 40, onTimeRate: 50 });
    expect(r.perDay['2026-11-05']).toEqual({ open: 0, done: 2 });
    expect(r.perDay['2026-11-20']).toEqual({ open: 1, done: 0 });
    expect(r.byCategory.find((x) => x.categoryId === 'c1')).toEqual({
      categoryId: 'c1',
      open: 0,
      done: 2,
    });
  });
});

describe('GET /api/dashboard', () => {
  it('ต้อง login', async () => {
    expect((await new Client(env).call('GET', '/api/dashboard')).status).toBe(401);
  });
  it('เดดไลน์ของเดือน: เฉพาะเดือนที่เลือก (เวลาไทย), เรียงตามวัน, ไม่รวมเสร็จในรายการแต่นับในสรุป', async () => {
    await mk(a, { title: 'ปลายเดือน', ...day('2026-11-28') });
    await mk(a, { title: 'ต้นเดือนถัดไป', ...day('2026-12-01') });
    await mk(a, { title: 'กลางเดือน', ...day('2026-11-15') });
    const d = await mk(a, { title: 'เสร็จแล้ว', ...day('2026-11-03') });
    await a.call('POST', `/api/tasks/${d.id}/complete`);
    await mk(a, { title: 'เดดไลน์เวลา', dueAt: '2026-11-30T16:30:00.000Z' }); // 23:30 ไทย 30 พ.ย. = ยังอยู่เดือนนี้
    await mk(a, { title: 'เดดไลน์ข้ามเดือน', dueAt: '2026-11-30T17:30:00.000Z' }); // 00:30 ไทย 1 ธ.ค.
    const j = await dash(a);
    expect(j.month).toBe('2026-11');
    expect(j.today).toBe(TODAY);
    expect(j.deadlines.tasks.map((t: { title: string }) => t.title)).toEqual([
      'กลางเดือน',
      'ปลายเดือน',
      'เดดไลน์เวลา',
    ]);
    expect(j.deadlines).toMatchObject({ open: 3, done: 1, completionRate: 25 });
    const dec = await dash(a, '?month=2026-12');
    expect(dec.deadlines.tasks.map((t: { title: string }) => t.title).sort()).toEqual([
      'ต้นเดือนถัดไป',
      'เดดไลน์ข้ามเดือน',
    ]);
    expect((await dash(a, '?month=bad')).month).toBe('2026-11'); // ค่าผิด = เดือนนี้
  });
  it('งานสำคัญ: เฉพาะ importance≥3 ที่ยังไม่เสร็จ เรียงตามคะแนน สูงสุด 8', async () => {
    await mk(a, { title: 'ไม่สำคัญ', importance: 2, ...day(TODAY) });
    await mk(a, { title: 'สำคัญไม่มีวัน', importance: 4 });
    await mk(a, { title: 'สำคัญวันนี้', importance: 4, ...day(TODAY) });
    const done = await mk(a, { title: 'สำคัญเสร็จแล้ว', importance: 4, ...day(TODAY) });
    await a.call('POST', `/api/tasks/${done.id}/complete`);
    expect((await dash(a)).important.map((t: { title: string }) => t.title)).toEqual([
      'สำคัญวันนี้',
      'สำคัญไม่มีวัน',
    ]);
    for (let i = 0; i < 10; i++)
      await mk(a, { title: `ส${i}`, importance: 3, ...day('2026-11-30') });
    expect((await dash(a)).important).toHaveLength(8);
  });
  it('ประสิทธิภาพ: สัปดาห์นี้/ก่อนหน้า, สตรีค, โฟกัสสัปดาห์นี้', async () => {
    for (const t of ['ก', 'ข']) {
      const x = await mk(a, { title: t, ...day(TODAY) });
      await a.call('POST', `/api/tasks/${x.id}/complete`);
    }
    freezeNow(new Date('2026-11-11T10:00:00+07:00'));
    const y = await mk(a, { title: 'เมื่อวาน', ...day(TODAY) });
    await a.call('POST', `/api/tasks/${y.id}/complete`);
    freezeNow(new Date(`${TODAY}T10:00:00+07:00`));
    const p = (await dash(a)).performance;
    expect(p.weekly).toHaveLength(8);
    expect(p.doneThisWeek).toBe(3);
    expect(p.doneLastWeek).toBe(0);
    expect(p.streak).toBe(2);
    expect(p.focusMinutesWeek).toBe(0);
  });
  it('ควรจัดการ: ค้าง/ยังไม่ตั้งวัน/ถูกเลื่อนบ่อย', async () => {
    await mk(a, { title: 'ค้าง', ...day('2026-11-01') });
    await mk(a, { title: 'ไม่มีวัน' });
    const s = await mk(a, { title: 'เลื่อนบ่อย', ...day('2026-11-20') });
    await a.call('POST', `/api/tasks/${s.id}/snooze`, { days: 1 });
    await a.call('POST', `/api/tasks/${s.id}/snooze`, { days: 1 });
    const at = (await dash(a)).attention;
    expect(at.overdue).toBe(1);
    expect(at.unscheduled).toBe(1);
    expect(at.stalled.map((t: { title: string }) => t.title)).toEqual(['เลื่อนบ่อย']);
  });
  it('งาน 7 วันข้างหน้า (ภาระงาน): เฉพาะที่ยังไม่เสร็จในช่วงวันนี้–+6', async () => {
    await mk(a, { title: 'วันนี้', ...day(TODAY), estimateMinutes: 60 });
    await mk(a, { title: 'อีก 6 วัน', ...day('2026-11-18') });
    await mk(a, { title: 'อีก 7 วัน', ...day('2026-11-19') });
    const w = (await dash(a)).week.map((t: { title: string }) => t.title).sort();
    expect(w).toEqual(['วันนี้', 'อีก 6 วัน']);
  });
  it('ข้อมูลแยกตามบัญชี', async () => {
    await mk(b, { title: 'ของ B', importance: 4, ...day(TODAY) });
    const j = await dash(a);
    expect(j.deadlines.tasks).toEqual([]);
    expect(j.important).toEqual([]);
    expect(j.week).toEqual([]);
    expect(j.attention).toMatchObject({ overdue: 0, unscheduled: 0, stalled: [] });
  });
  it('บัญชีว่างไม่พัง', async () => {
    const j = await dash(a);
    expect(j.deadlines).toMatchObject({ open: 0, done: 0, completionRate: 0, onTimeRate: null });
    expect(j.performance.streak).toBe(0);
  });
});

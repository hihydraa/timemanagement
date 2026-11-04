import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freezeNow } from '../src/lib/time';
import { Client, makeEnv } from './helpers/app';

const NOW = new Date('2026-11-04T03:00:00Z'); // พุธ 10:00 เวลาไทย
const at = (hm: string, d = '2026-11-04') => new Date(`${d}T${hm}:00+07:00`).toISOString();
let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;

beforeEach(async () => {
  freezeNow(NOW);
  env = makeEnv();
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
});
afterEach(() => {
  freezeNow(null);
  vi.unstubAllGlobals();
});

const create = async (c: Client, body: Record<string, unknown>) =>
  (await c.call('POST', '/api/tasks', body)).json.task as { id: string; title: string };

describe('GET /api/cockpit', () => {
  it('รวมงานค้าง / เดดไลน์วันนี้ / งานวันนี้ / งานที่เสร็จวันนี้ / นาทีโฟกัส / ชั่วโมงทำงาน', async () => {
    await create(a, { title: 'ค้าง', allDay: true, dueDate: '2026-11-02' });
    await create(a, { title: 'ส่งงาน', dueAt: at('17:00') });
    await create(a, { title: 'ประชุม', startAt: at('13:00'), endAt: at('14:00') });
    const done = await create(a, { title: 'เสร็จแล้ว', startAt: at('08:00'), endAt: at('08:30') });
    await a.call('POST', `/api/tasks/${done.id}/complete`);
    await create(a, { title: 'พรุ่งนี้', allDay: true, dueDate: '2026-11-05' }); // ไม่เกี่ยวกับวันนี้
    await create(a, { title: 'ไม่มีวัน' }); // Inbox ไม่อยู่ในหน้านี้
    const f = await a.call('POST', '/api/focus-sessions', {
      startedAt: at('09:00'),
      endedAt: at('09:25'),
      minutes: 25,
    });
    expect(f.status).toBe(201);

    const r = (await a.call('GET', '/api/cockpit')).json;
    expect(r.date).toBe('2026-11-04');
    expect(r.overdue.map((t: { title: string }) => t.title)).toEqual(['ค้าง']);
    expect(r.dueToday.map((t: { title: string }) => t.title)).toEqual(['ส่งงาน']);
    expect(r.today.map((t: { title: string }) => t.title)).toEqual(['ประชุม']);
    expect(r.doneToday.map((t: { title: string }) => t.title)).toEqual(['เสร็จแล้ว']);
    expect(r.focusMinutes).toBe(25);
    expect(r.work).toEqual({ start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] });
  });

  it('ใช้ชั่วโมงทำงานของผู้ใช้ และไม่เห็นข้อมูลของคนอื่น', async () => {
    await create(a, { title: 'ของ A', startAt: at('13:00'), endAt: at('14:00') });
    await a.call('PATCH', '/api/settings', { workStart: '08:00', workEnd: '16:00' });
    const mine = (await a.call('GET', '/api/cockpit')).json;
    expect(mine.work.start).toBe('08:00');
    const other = (await b.call('GET', '/api/cockpit')).json;
    expect(JSON.stringify(other)).not.toContain('ของ A');
    expect(other.today).toEqual([]);
    expect(other.focusMinutes).toBe(0);
  });

  it('ต้องล็อกอิน', async () => {
    expect((await new Client(env).call('GET', '/api/cockpit')).status).toBe(401);
  });
});

describe('POST /api/today/reschedule-overdue', () => {
  it('เลื่อนงานค้างไปวันนี้/พรุ่งนี้ คงเวลาในวันไว้ นับ snooze และไม่แตะงานคนอื่น/ซีรีส์', async () => {
    const dated = await create(a, { title: 'ทั้งวัน', allDay: true, dueDate: '2026-11-01' });
    const timed = await create(a, { title: 'มีเวลา', dueAt: at('15:00', '2026-11-02') });
    const series = await create(a, {
      title: 'ซีรีส์',
      startAt: at('09:00', '2026-11-01'),
      recurrenceRule: 'FREQ=DAILY',
    });
    const mine = await create(b, { title: 'ของ B', allDay: true, dueDate: '2026-11-01' });

    const r = await a.call('POST', '/api/today/reschedule-overdue', { to: 'tomorrow' });
    expect(r.status).toBe(200);
    expect(r.json.hasMore).toBe(false);
    expect(r.json.movedIds.sort()).toEqual([dated.id, timed.id].sort());

    const d = (await a.call('GET', `/api/tasks/${dated.id}`)).json.task;
    expect(d.dueDate).toBe('2026-11-05');
    expect(d.snoozeCount).toBe(1);
    const t = (await a.call('GET', `/api/tasks/${timed.id}`)).json.task;
    expect(t.dueAt).toBe(at('15:00', '2026-11-05')); // เวลา 15:00 คงเดิม
    const sr = (await a.call('GET', `/api/tasks/${series.id}`)).json.task;
    expect(sr.startAt).toBe(at('09:00', '2026-11-01')); // ซีรีส์ไม่ถูกเลื่อน
    expect(sr.snoozeCount).toBe(0);
    expect((await b.call('GET', `/api/tasks/${mine.id}`)).json.task.dueDate).toBe('2026-11-01');
    expect((await a.call('GET', '/api/cockpit')).json.overdue).toEqual([]);
  });

  it('ไปวันนี้: เวลาที่ผ่านไปแล้วเลื่อนเป็นสิ้นวัน (ไม่ค้างเป็นเลยกำหนดอีก)', async () => {
    const early = await create(a, { title: 'เช้า', dueAt: at('08:00', '2026-11-03') });
    await a.call('POST', '/api/today/reschedule-overdue', { to: 'today' });
    const t = (await a.call('GET', `/api/tasks/${early.id}`)).json.task;
    expect(t.dueAt).toBe(at('23:59'));
    expect((await a.call('GET', '/api/cockpit')).json.overdue).toEqual([]);
    expect(
      (await a.call('GET', '/api/cockpit')).json.dueToday.map((x: { id: string }) => x.id),
    ).toEqual([early.id]);
  });

  it('ครั้งละไม่เกิน 15 งาน และบอก hasMore; เรียกซ้ำจนหมด', async () => {
    for (let i = 0; i < 17; i++)
      await create(a, { title: `ค้าง${i}`, allDay: true, dueDate: '2026-11-01' });
    const r1 = (await a.call('POST', '/api/today/reschedule-overdue', { to: 'tomorrow' })).json;
    expect(r1.movedIds).toHaveLength(15);
    expect(r1.hasMore).toBe(true);
    const r2 = (await a.call('POST', '/api/today/reschedule-overdue', { to: 'tomorrow' })).json;
    expect(r2.movedIds).toHaveLength(2);
    expect(r2.hasMore).toBe(false);
  });

  it('ตรวจ input และต้องล็อกอิน', async () => {
    expect((await a.call('POST', '/api/today/reschedule-overdue', { to: 'nextweek' })).status).toBe(
      400,
    );
    expect((await a.call('POST', '/api/today/reschedule-overdue', {})).status).toBe(400);
    expect(
      (await new Client(env).call('POST', '/api/today/reschedule-overdue', { to: 'today' })).status,
    ).toBe(401);
  });
});

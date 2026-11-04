import { beforeEach, describe, expect, it } from 'vitest';
import { Client, makeEnv } from './helpers/app';

let a: Client;
let b: Client;
beforeEach(async () => {
  const env = makeEnv();
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
});

describe('ชั่วโมงทำงานต่อบัญชี', () => {
  it('ค่าเริ่มต้น 09:00–18:00 จันทร์–ศุกร์ และบันทึกแยกตามบัญชี', async () => {
    expect((await a.call('GET', '/api/settings')).json.work).toEqual({
      start: '09:00',
      end: '18:00',
      days: [1, 2, 3, 4, 5],
    });
    const r = await a.call('PATCH', '/api/settings', {
      workStart: '08:00',
      workEnd: '16:30',
      workDays: [6, 1, 3, 3],
    });
    expect(r.status).toBe(200);
    expect(r.json.work).toEqual({ start: '08:00', end: '16:30', days: [1, 3, 6] });
    expect((await b.call('GET', '/api/settings')).json.work.start).toBe('09:00');
  });

  it('ปฏิเสธเวลาเลิกที่ไม่หลังเวลาเริ่ม (เทียบกับค่าที่บันทึกไว้ด้วย) และวันที่ไม่ถูกต้อง', async () => {
    expect(
      (await a.call('PATCH', '/api/settings', { workStart: '18:00', workEnd: '09:00' })).status,
    ).toBe(400);
    expect((await a.call('PATCH', '/api/settings', { workEnd: '08:00' })).status).toBe(400); // ก่อน 09:00 เดิม
    expect((await a.call('PATCH', '/api/settings', { workDays: [] })).status).toBe(400);
    expect((await a.call('PATCH', '/api/settings', { workDays: [0, 8] })).status).toBe(400);
    expect((await a.call('PATCH', '/api/settings', { workStart: '9:00' })).status).toBe(400);
    expect((await a.call('GET', '/api/settings')).json.work.end).toBe('18:00');
  });

  it('การตั้งค่าชั่วโมงทำงานไม่กระทบค่าแจ้งเตือน', async () => {
    await a.call('PATCH', '/api/settings', { morningDigestTime: '06:45' });
    await a.call('PATCH', '/api/settings', { workEnd: '17:00' });
    expect((await a.call('GET', '/api/settings')).json.settings.morningDigestTime).toBe('06:45');
  });
});

describe('จำนวนครั้งที่เลื่อนงาน (snooze_count)', () => {
  it('เพิ่มขึ้นทุกครั้งที่ snooze และคืนใน DTO', async () => {
    const t = (
      await a.call('POST', '/api/tasks', { title: 'x', dueDate: '2026-11-10', allDay: true })
    ).json.task;
    expect(t.snoozeCount).toBe(0);
    const s1 = await a.call('POST', `/api/tasks/${t.id}/snooze`, { days: 1 });
    expect(s1.json.task.snoozeCount).toBe(1);
    await a.call('POST', `/api/tasks/${t.id}/snooze`, { days: 1 });
    expect((await a.call('GET', `/api/tasks/${t.id}`)).json.task.snoozeCount).toBe(2);
  });
});

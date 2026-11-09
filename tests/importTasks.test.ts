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

const sample = [
  {
    title: 'ส่งรายงาน',
    status: 'done',
    dueDate: '2025-03-03',
    completedAt: '2025-03-03T05:00:00.000Z',
    tags: ['Jane'],
  },
  { title: 'ทบทวน WI', description: 'x', dueDate: null, tags: ['Jane', 'QA1'] },
];

describe('POST /api/import/tasks', () => {
  it('นำเข้างานเข้าบัญชีตัวเอง ไม่ซิงก์ Google และไม่โผล่ที่บัญชีอื่น', async () => {
    const r = await a.call('POST', '/api/import/tasks', { tasks: sample });
    expect(r.json).toEqual({ imported: 2, skipped: 0 });
    const all = (
      await a.call('GET', '/api/tasks?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z')
    ).json.tasks;
    const done = all.find((t: { title: string }) => t.title === 'ส่งรายงาน');
    expect(done).toMatchObject({
      status: 'done',
      dueDate: '2025-03-03',
      allDay: true,
      gcalSync: false,
      completedAt: '2025-03-03T05:00:00.000Z',
      tags: ['Jane'],
    });
    expect(
      (await a.call('GET', '/api/inbox')).json.tasks.map((t: { title: string }) => t.title),
    ).toContain('ทบทวน WI');
    expect((await b.call('GET', '/api/inbox')).json.tasks).toEqual([]);
  });
  it('นำเข้าซ้ำไม่เบิ้ล (ข้ามงานที่ชื่อ+วัน+สถานะตรงกัน)', async () => {
    await a.call('POST', '/api/import/tasks', { tasks: sample });
    const r = await a.call('POST', '/api/import/tasks', { tasks: [...sample, { title: 'ใหม่' }] });
    expect(r.json).toEqual({ imported: 1, skipped: 2 });
  });
  it('ตรวจอินพุต: ว่าง/เกิน 500/ฟิลด์แปลก/วันที่ผิด = 400', async () => {
    expect((await a.call('POST', '/api/import/tasks', { tasks: [] })).status).toBe(400);
    expect(
      (
        await a.call('POST', '/api/import/tasks', {
          tasks: Array.from({ length: 501 }, (_, i) => ({ title: `t${i}` })),
        })
      ).status,
    ).toBe(400);
    expect(
      (await a.call('POST', '/api/import/tasks', { tasks: [{ title: 'x', userId: 'b' }] })).status,
    ).toBe(400);
    expect(
      (await a.call('POST', '/api/import/tasks', { tasks: [{ title: 'x', dueDate: '3/3/25' }] }))
        .status,
    ).toBe(400);
  });
  it('ชุดใหญ่ (300 งาน + แท็ก) สำเร็จ', async () => {
    const big = Array.from({ length: 300 }, (_, i) => ({
      title: `งาน ${i}`,
      dueDate: '2026-01-01',
      tags: ['a', 'b'],
    }));
    expect((await a.call('POST', '/api/import/tasks', { tasks: big })).json.imported).toBe(300);
  });
  it('ต้อง login', async () => {
    const anon = new Client(makeEnv());
    expect((await anon.call('POST', '/api/import/tasks', { tasks: sample })).status).toBe(401);
  });
});

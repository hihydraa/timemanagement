import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freezeNow } from '../src/lib/time';
import { Client, makeEnv } from './helpers/app';

const NOW = new Date('2026-11-04T03:00:00Z');
const PDF = new TextEncoder().encode('%PDF-1.4 X');
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

const count = async (table: string, where = '') =>
  Number(
    ((await env.DB.prepare(`select count(*) n from ${table} ${where}`).first()) as { n: number }).n,
  );
const r2Keys = () => (env.FILES as unknown as { keys(): string[] }).keys();

async function seed(c: Client, tag: string) {
  const t = (
    await c.call('POST', '/api/tasks', {
      title: `${tag}-task`,
      tags: [`${tag}-tag`],
      startAt: '2026-11-05T02:00:00.000Z',
    })
  ).json.task.id as string;
  await c.call('POST', `/api/tasks/${t}/subtasks`, { title: `${tag}-sub` });
  await c.upload(`/api/tasks/${t}/attachments`, [{ name: `${tag}.pdf`, data: PDF }]);
  const s = (
    await c.call('POST', '/api/tasks', {
      title: `${tag}-series`,
      startAt: '2026-11-05T03:00:00.000Z',
      recurrenceRule: 'FREQ=DAILY',
    })
  ).json.task.id as string;
  await c.call('PATCH', `/api/tasks/${encodeURIComponent(`${s}~2026-11-06`)}`, {
    description: 'x',
  });
  return t;
}

describe('ลบบัญชีและข้อมูลทั้งหมด', () => {
  it('ต้องพิมพ์อีเมลยืนยันให้ตรง ไม่งั้นไม่ลบอะไร', async () => {
    await seed(a, 'A');
    const wrong = await a.call('DELETE', '/api/account', { confirm: 'b@x.com' });
    expect(wrong.status).toBe(400);
    expect(wrong.json.error.code).toBe('confirm_mismatch');
    expect((await a.call('DELETE', '/api/account', {})).status).toBe(400);
    expect(await count('users')).toBe(2);
    expect(await count('tasks', `where user_id=(select id from users where email='a@x.com')`)).toBe(
      3,
    );
  });

  it('ลบข้อมูลของ A ครบทุกตาราง + ไฟล์ใน R2 โดยข้อมูลของ B ไม่เปลี่ยน', async () => {
    await seed(a, 'A');
    await seed(b, 'B');
    const bTasks = (await b.call('GET', '/api/tasks')).json.tasks.map((t: { id: string }) => t.id);
    const bTitles = (await b.call('GET', '/api/tasks')).json.tasks
      .map((t: { title: string }) => t.title)
      .sort();
    expect(r2Keys().length).toBe(2);

    const r = await a.call('DELETE', '/api/account', { confirm: 'A@X.com' }); // ไม่สนตัวพิมพ์
    expect(r.status).toBe(200);
    expect(r.json.deletedFiles).toBe(1);

    // ตารางที่ผูกกับผู้ใช้เหลือเฉพาะของ B (A: งาน 1 + ซีรีส์ 1 + ครั้งที่แก้ 1 = 3 แถว, tag 1, subtask 1, ไฟล์ 1)
    expect(await count('users')).toBe(1);
    expect(await count('user_settings')).toBe(1);
    expect(await count('categories')).toBe(6);
    expect(await count('tasks')).toBe(3);
    expect(await count('task_tags')).toBe(1);
    expect(await count('subtasks')).toBe(1);
    expect(await count('attachments')).toBe(1);
    expect(r2Keys().length).toBe(1);

    // ข้อมูลของ B ยังอยู่ครบ
    const after = (await b.call('GET', '/api/tasks')).json.tasks;
    expect(after.map((t: { id: string }) => t.id)).toEqual(bTasks);
    expect(after.map((t: { title: string }) => t.title).sort()).toEqual(bTitles);
  });

  it('cookie เก่าของบัญชีที่ลบแล้วใช้ไม่ได้ (ไม่เกิดข้อมูลกำพร้า)', async () => {
    await a.call('DELETE', '/api/account', { confirm: 'a@x.com' });
    expect((await a.call('GET', '/api/tasks')).status).toBe(401);
    expect((await a.call('POST', '/api/tasks', { title: 'ghost' })).status).toBe(401);
    expect((await a.call('GET', '/api/session')).json.user).toBeNull();
    expect(await count('tasks')).toBe(0);
  });

  it('ล็อกอินใหม่ด้วยอีเมลเดิมได้เป็นบัญชีใหม่ที่ว่างเปล่า', async () => {
    await seed(a, 'A');
    await a.call('DELETE', '/api/account', { confirm: 'a@x.com' });
    const again = new Client(env);
    await again.login('a@x.com');
    expect((await again.call('GET', '/api/tasks')).json.tasks).toEqual([]);
  });

  it('ต้องล็อกอินก่อน และ B ลบบัญชีของ A ไม่ได้ (ลบได้เฉพาะของตัวเอง)', async () => {
    expect(
      (await new Client(env).call('DELETE', '/api/account', { confirm: 'a@x.com' })).status,
    ).toBe(401);
    await seed(a, 'A');
    const r = await b.call('DELETE', '/api/account', { confirm: 'a@x.com' });
    expect(r.status).toBe(400); // อีเมลไม่ตรงกับบัญชีของ B
    expect(await count('users')).toBe(2);
  });
});

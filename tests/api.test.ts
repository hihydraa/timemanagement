import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { freezeNow } from '../src/lib/time';
import { Client, makeEnv } from './helpers/app';

let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;

beforeEach(async () => {
  env = makeEnv();
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
});
afterEach(() => freezeNow(null));

describe('auth', () => {
  it('ไม่มี cookie ได้ 401 ในรูปแบบ error เดียวกัน', async () => {
    const r = await new Client(env).call('GET', '/api/tasks');
    expect(r.status).toBe(401);
    expect(r.json.error.code).toBe('unauthorized');
  });
  it('cookie ปลอม/เสียหาย ได้ 401', async () => {
    const c = new Client(env);
    c.cookie = 'dobby_session=not.a.jwt';
    expect((await c.call('GET', '/api/me')).status).toBe(401);
  });
  it('อีเมลนอก ALLOWED_EMAILS login ไม่ได้', async () => {
    const res = await app.request('http://x/auth/dev-login?email=evil@x.com', {}, env);
    expect(res.status).toBe(403);
  });
  it('ALLOWED_EMAILS ว่าง = ไม่อนุญาตใคร', async () => {
    const res = await app.request(
      'http://x/auth/dev-login?email=a@x.com',
      {},
      { ...env, ALLOWED_EMAILS: '' },
    );
    expect(res.status).toBe(403);
  });
  it('dev-login ปิดเมื่อไม่ตั้ง DEV_LOGIN', async () => {
    const res = await app.request(
      'http://x/auth/dev-login?email=a@x.com',
      {},
      { ...env, DEV_LOGIN: undefined },
    );
    expect(res.status).toBe(404);
  });
  it('cookie เป็น HttpOnly + SameSite=Lax', async () => {
    const res = await new Client(env).login('a@x.com');
    const sc = res.headers.get('set-cookie')!;
    expect(sc).toContain('HttpOnly');
    expect(sc).toContain('SameSite=Lax');
  });
  it('/api/me คืนผู้ใช้ และ seed ประเภทเริ่มต้น 6 อัน', async () => {
    expect((await a.call('GET', '/api/me')).json.user.email).toBe('a@x.com');
    const cats = (await a.call('GET', '/api/categories')).json.categories;
    expect(cats.map((c: { name: string }) => c.name)).toEqual([
      'งาน',
      'ส่วนตัว',
      'เรียน',
      'สุขภาพ',
      'การเงิน',
      'ครอบครัว',
    ]);
  });
  it('login ซ้ำไม่สร้างผู้ใช้/ประเภทซ้ำ', async () => {
    await a.login('a@x.com');
    expect((await a.call('GET', '/api/categories')).json.categories).toHaveLength(6);
  });
  it('logout ล้าง cookie', async () => {
    const r = await a.call('POST', '/auth/logout');
    expect(r.status).toBe(200);
  });
});

describe('security', () => {
  it('Origin แปลกปลอมบน mutation ได้ 403', async () => {
    const r = await a.call('POST', '/api/tasks', { title: 'x' }, { Origin: 'https://evil.com' });
    expect(r.status).toBe(403);
  });
  it('Origin ของแอปผ่าน', async () => {
    const r = await a.call(
      'POST',
      '/api/tasks',
      { title: 'x' },
      { Origin: 'http://localhost:5173' },
    );
    expect(r.status).toBe(201);
  });
  it('มี security headers', async () => {
    const r = await a.call('GET', '/api/health');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(r.headers.get('referrer-policy')).toBeTruthy();
  });
});

describe('tasks CRUD', () => {
  it('สร้าง/อ่าน/แก้/ลบ', async () => {
    const created = (
      await a.call('POST', '/api/tasks', {
        title: '  ส่งรายงาน ',
        urgency: 4,
        importance: 3,
        startAt: '2026-11-05T07:00:00Z',
        endAt: '2026-11-05T08:00:00Z',
        tags: ['งาน', 'งาน', 'ด่วน'],
      })
    ).json.task;
    expect(created.title).toBe('ส่งรายงาน');
    expect(created.tags).toEqual(['ด่วน', 'งาน'].sort());
    expect(created.startAt).toBe('2026-11-05T07:00:00.000Z');

    const got = (await a.call('GET', `/api/tasks/${created.id}`)).json.task;
    expect(got.urgency).toBe(4);

    const patched = (
      await a.call('PATCH', `/api/tasks/${created.id}`, { title: 'ใหม่', tags: ['x'] })
    ).json.task;
    expect(patched.title).toBe('ใหม่');
    expect(patched.tags).toEqual(['x']);
    expect(patched.importance).toBe(3); // ไม่ถูกรีเซ็ต

    expect((await a.call('DELETE', `/api/tasks/${created.id}`)).status).toBe(200);
    expect((await a.call('GET', `/api/tasks/${created.id}`)).status).toBe(404);
  });
  it('validation: ชื่อว่าง, urgency เกินช่วง, เวลาสิ้นสุดก่อนเริ่ม, JSON เสีย', async () => {
    expect((await a.call('POST', '/api/tasks', { title: '   ' })).status).toBe(400);
    expect((await a.call('POST', '/api/tasks', { title: 'x', urgency: 9 })).status).toBe(400);
    const r = await a.call('POST', '/api/tasks', {
      title: 'x',
      startAt: '2026-11-05T08:00:00Z',
      endAt: '2026-11-05T07:00:00Z',
    });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('validation_error');
    const bad = await app.request(
      'http://x/api/tasks',
      {
        method: 'POST',
        headers: { Cookie: a.cookie, 'Content-Type': 'application/json' },
        body: '{oops',
      },
      env,
    );
    expect(bad.status).toBe(400);
  });
  it('งาน all-day ต้องมี dueDate และไม่เก็บเวลา', async () => {
    expect((await a.call('POST', '/api/tasks', { title: 'x', allDay: true })).status).toBe(400);
    const t = (
      await a.call('POST', '/api/tasks', {
        title: 'x',
        allDay: true,
        dueDate: '2026-11-06',
        startAt: '2026-11-06T01:00:00Z',
      })
    ).json.task;
    expect(t.allDay).toBe(true);
    expect(t.startAt).toBeNull();
    expect(t.dueDate).toBe('2026-11-06');
  });
  it('complete ตั้ง completedAt, เปลี่ยนกลับเป็น todo ล้างค่า', async () => {
    const t = (await a.call('POST', '/api/tasks', { title: 'x' })).json.task;
    const done = (await a.call('POST', `/api/tasks/${t.id}/complete`)).json.task;
    expect(done.status).toBe('done');
    expect(done.completedAt).toBeTruthy();
    const back = (await a.call('PATCH', `/api/tasks/${t.id}`, { status: 'todo' })).json.task;
    expect(back.completedAt).toBeNull();
  });
  it('snooze เลื่อนเวลาและวัน', async () => {
    const t = (
      await a.call('POST', '/api/tasks', {
        title: 'x',
        startAt: '2026-11-05T07:00:00Z',
        endAt: '2026-11-05T08:00:00Z',
      })
    ).json.task;
    const s = (await a.call('POST', `/api/tasks/${t.id}/snooze`, { minutes: 60 })).json.task;
    expect(s.startAt).toBe('2026-11-05T08:00:00.000Z');
    expect(s.endAt).toBe('2026-11-05T09:00:00.000Z');
    const d = (
      await a.call('POST', '/api/tasks', { title: 'd', allDay: true, dueDate: '2026-11-30' })
    ).json.task;
    const s2 = (await a.call('POST', `/api/tasks/${d.id}/snooze`, { days: 1 })).json.task;
    expect(s2.dueDate).toBe('2026-12-01');
    const inbox = (await a.call('POST', '/api/tasks', { title: 'i' })).json.task;
    expect((await a.call('POST', `/api/tasks/${inbox.id}/snooze`, { days: 1 })).status).toBe(400);
  });
});

describe('query by range', () => {
  it('กรองตามช่วงเวลา, all-day, deadline, status, q, tag', async () => {
    const mk = (b: object) => a.call('POST', '/api/tasks', b);
    await mk({
      title: 'in-range',
      startAt: '2026-11-05T03:00:00Z',
      endAt: '2026-11-05T04:00:00Z',
      tags: ['t1'],
    });
    await mk({ title: 'out-range', startAt: '2026-12-05T03:00:00Z' });
    await mk({ title: 'allday', allDay: true, dueDate: '2026-11-05' });
    await mk({ title: 'deadline', dueAt: '2026-11-05T10:00:00Z' });
    await mk({ title: 'inbox' });
    // ช่วง = 5 พ.ย. ตามเวลาไทย
    const from = '2026-11-04T17:00:00.000Z';
    const to = '2026-11-05T17:00:00.000Z';
    const titles = async (qs = '') =>
      (await a.call('GET', `/api/tasks?from=${from}&to=${to}${qs}`)).json.tasks
        .map((t: { title: string }) => t.title)
        .sort();
    expect(await titles()).toEqual(['allday', 'deadline', 'in-range']);
    expect(await titles('&q=range')).toEqual(['in-range']);
    expect(await titles('&tag=t1')).toEqual(['in-range']);
    expect(await titles('&status=done')).toEqual([]);
    const all = (await a.call('GET', '/api/tasks')).json.tasks;
    expect(all).toHaveLength(5);
  });
  it('from/to รูปแบบผิดได้ 400', async () => {
    expect((await a.call('GET', '/api/tasks?from=yesterday&to=x')).status).toBe(400);
  });
});

describe('today / inbox', () => {
  it('แยก overdue / dueToday / today ตามเวลาไทย และไม่ซ้ำ', async () => {
    freezeNow(new Date('2026-11-05T05:00:00Z')); // 12:00 น. ไทย 5 พ.ย.
    const mk = (b: object) => a.call('POST', '/api/tasks', b);
    await mk({ title: 'overdue-at', dueAt: '2026-11-05T02:00:00Z' });
    await mk({ title: 'overdue-date', allDay: true, dueDate: '2026-11-03' });
    await mk({ title: 'due-later', dueAt: '2026-11-05T08:00:00Z' });
    await mk({ title: 'meeting', startAt: '2026-11-05T07:00:00Z', endAt: '2026-11-05T08:00:00Z' });
    await mk({ title: 'today-allday', allDay: true, dueDate: '2026-11-05' });
    await mk({ title: 'tomorrow', startAt: '2026-11-05T18:00:00Z' }); // 01:00 วันที่ 6 ไทย
    await mk({ title: 'done-old', dueAt: '2026-11-05T01:00:00Z', status: 'done' });
    await mk({ title: 'inbox-item' });
    const r = (await a.call('GET', '/api/today')).json;
    const names = (k: string) => r[k].map((t: { title: string }) => t.title).sort();
    expect(r.date).toBe('2026-11-05');
    expect(names('overdue')).toEqual(['overdue-at', 'overdue-date']);
    expect(names('dueToday')).toEqual(['due-later']);
    expect(names('today')).toEqual(['meeting', 'today-allday']);
    const inbox = (await a.call('GET', '/api/inbox')).json.tasks;
    expect(inbox.map((t: { title: string }) => t.title)).toEqual(['inbox-item']);
  });
});

describe('categories', () => {
  it('CRUD และลบแล้วงานไม่มีประเภท', async () => {
    const cat = (await a.call('POST', '/api/categories', { name: 'โปรเจกต์', color: '#112233' }))
      .json.category;
    const t = (await a.call('POST', '/api/tasks', { title: 'x', categoryId: cat.id })).json.task;
    expect(
      (await a.call('PATCH', `/api/categories/${cat.id}`, { color: '#ffffff' })).json.category
        .color,
    ).toBe('#ffffff');
    expect((await a.call('POST', '/api/categories', { name: 'x', color: 'red' })).status).toBe(400);
    await a.call('DELETE', `/api/categories/${cat.id}`);
    expect((await a.call('GET', `/api/tasks/${t.id}`)).json.task.categoryId).toBeNull();
  });
});

describe('authorization: user A vs user B', () => {
  it('B เข้าถึง/แก้/ลบ/เสร็จ/เลื่อนงานของ A ไม่ได้ และไม่เห็นในรายการ', async () => {
    const t = (
      await a.call('POST', '/api/tasks', {
        title: 'ของ A',
        startAt: '2026-11-05T03:00:00Z',
        tags: ['secret'],
      })
    ).json.task;
    expect((await b.call('GET', `/api/tasks/${t.id}`)).status).toBe(404);
    expect((await b.call('PATCH', `/api/tasks/${t.id}`, { title: 'hacked' })).status).toBe(404);
    expect((await b.call('DELETE', `/api/tasks/${t.id}`)).status).toBe(404);
    expect((await b.call('POST', `/api/tasks/${t.id}/complete`)).status).toBe(404);
    expect((await b.call('POST', `/api/tasks/${t.id}/snooze`, { days: 1 })).status).toBe(404);
    expect((await b.call('GET', '/api/tasks')).json.tasks).toHaveLength(0);
    expect((await b.call('GET', '/api/tasks?tag=secret')).json.tasks).toHaveLength(0);
    expect((await b.call('GET', '/api/inbox')).json.tasks).toHaveLength(0);
    const still = (await a.call('GET', `/api/tasks/${t.id}`)).json.task;
    expect(still.title).toBe('ของ A');
  });
  it('B ใช้/แก้/ลบประเภทของ A ไม่ได้', async () => {
    const catA = (await a.call('GET', '/api/categories')).json.categories[0];
    expect((await b.call('POST', '/api/tasks', { title: 'x', categoryId: catA.id })).status).toBe(
      400,
    );
    const own = (await b.call('POST', '/api/tasks', { title: 'x' })).json.task;
    expect((await b.call('PATCH', `/api/tasks/${own.id}`, { categoryId: catA.id })).status).toBe(
      400,
    );
    expect((await b.call('PATCH', `/api/categories/${catA.id}`, { name: 'x' })).status).toBe(404);
    expect((await b.call('DELETE', `/api/categories/${catA.id}`)).status).toBe(404);
    const bCats = (await b.call('GET', '/api/categories')).json.categories;
    expect(bCats.every((c: { id: string }) => c.id !== catA.id)).toBe(true);
  });
});

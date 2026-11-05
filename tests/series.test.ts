import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freezeNow } from '../src/lib/time';
import { runNotifications } from '../src/services/notifications';
import { Client, makeEnv } from './helpers/app';
import { FakeGoogle } from './helpers/google';
import { json, LineHarness } from './helpers/line';

const DAY = '2026-11-04'; // พุธ
const at = (hm: string, date = DAY) => freezeNow(new Date(`${date}T${hm}:00+07:00`));
const iso = (hm: string, date = DAY) => new Date(`${date}T${hm}:00+07:00`).toISOString();
const bk = (date: string) => new Date(`${date}T00:00:00+07:00`).toISOString();
const LA = 'U' + 'a'.repeat(32);
const PDF = new TextEncoder().encode('%PDF-1.4 x');

interface T {
  id: string;
  title: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  dueAt: string | null;
  dueDate: string | null;
  allDay: boolean;
  parentTaskId: string | null;
  recurrenceId: string | null;
  recurrenceRule: string | null;
  tags: string[];
  subtaskTotal: number;
  subtaskDone: number;
  [k: string]: unknown;
}

let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;
const mk = async (c: Client, body: object) =>
  (await c.call('POST', '/api/tasks', body)).json.task as T;
const range = async (c: Client, from: string, to: string, qs = '') =>
  (
    await c.call(
      'GET',
      `/api/tasks?from=${encodeURIComponent(bk(from))}&to=${encodeURIComponent(bk(to))}${qs}`,
    )
  ).json.tasks as T[];
const get = async (c: Client, id: string) =>
  (await c.call('GET', `/api/tasks/${encodeURIComponent(id)}`)).json.task as T;
const dbRows = async (sql: string) =>
  (await env.DB.prepare(sql).all()).results as Record<string, unknown>[];
const vid = (parent: string, date: string) => `${parent}~${date}`;
const WEEKLY = {
  title: 'ประชุมทีม',
  startAt: iso('09:00', '2026-11-02'),
  endAt: iso('10:00', '2026-11-02'),
  recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
  urgency: 3,
  tags: ['ทีม'],
};

beforeEach(async () => {
  at('10:00');
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

describe('การขยาย instance ตอน query', () => {
  it('งานแม่ + instance เสมือนของครั้งถัดไป (ไม่ซ้ำกับครั้งแรก) พร้อมเวลา/ความยาว/แท็กของแม่', async () => {
    const p = await mk(a, WEEKLY);
    const list = await range(a, '2026-11-02', '2026-12-01');
    expect(list.map((t) => t.id)).toEqual([
      p.id,
      vid(p.id, '2026-11-09'),
      vid(p.id, '2026-11-16'),
      vid(p.id, '2026-11-23'),
      vid(p.id, '2026-11-30'),
    ]);
    const v = list[1]!;
    expect(v).toMatchObject({
      title: 'ประชุมทีม',
      status: 'todo',
      parentTaskId: p.id,
      recurrenceId: '2026-11-09',
      recurrenceRule: null,
      startAt: iso('09:00', '2026-11-09'),
      endAt: iso('10:00', '2026-11-09'),
      urgency: 1, // คำนวณจากวันที่ (อีก 7 วัน) ไม่ใช่ค่าที่ตั้ง
      tags: ['ทีม'],
    });
  });
  it('งานทั้งวัน / เดดไลน์อย่างเดียว / UNTIL / INTERVAL', async () => {
    const d = await mk(a, {
      title: 'ออกกำลังกาย',
      allDay: true,
      dueDate: '2026-11-04',
      recurrenceRule: 'FREQ=DAILY;UNTIL=20261107',
    });
    const dl = await mk(a, {
      title: 'ส่งรายงาน',
      dueAt: iso('17:00', '2026-11-04'),
      recurrenceRule: 'FREQ=WEEKLY;INTERVAL=2',
    });
    const list = await range(a, '2026-11-04', '2026-11-30');
    const days = list.filter((t) => t.title === 'ออกกำลังกาย').map((t) => t.dueDate);
    expect(days).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
    expect(list.filter((t) => t.title === 'ส่งรายงาน').map((t) => t.dueAt)).toEqual([
      iso('17:00', '2026-11-04'),
      iso('17:00', '2026-11-18'),
    ]);
    expect(d.id).toBeTruthy();
    expect(dl.id).toBeTruthy();
  });
  it('ขอบเขตของช่วง: ครั้งที่เริ่มพอดีขอบ to (exclusive) ไม่ติดมา', async () => {
    const p = await mk(a, WEEKLY);
    const list = await range(a, '2026-11-09', '2026-11-16'); // 16 พ.ย. 00:00 ไม่รวม
    expect(list.map((t) => t.id)).toEqual([vid(p.id, '2026-11-09')]);
  });
  it('กรอง status / category / q / tag ใช้กับ instance เสมือนด้วย', async () => {
    const cat = (await a.call('GET', '/api/categories')).json.categories[0];
    await mk(a, { ...WEEKLY, categoryId: cat.id });
    expect((await range(a, '2026-11-09', '2026-11-10')).length).toBe(1);
    expect(await range(a, '2026-11-09', '2026-11-10', '&status=done')).toHaveLength(0);
    expect(await range(a, '2026-11-09', '2026-11-10', '&status=todo')).toHaveLength(1);
    expect(await range(a, '2026-11-09', '2026-11-10', `&category=${cat.id}`)).toHaveLength(1);
    expect(await range(a, '2026-11-09', '2026-11-10', '&category=other')).toHaveLength(0);
    expect(
      await range(a, '2026-11-09', '2026-11-10', `&q=${encodeURIComponent('ทีม')}`),
    ).toHaveLength(1);
    expect(await range(a, '2026-11-09', '2026-11-10', '&q=zzz')).toHaveLength(0);
    expect(
      await range(a, '2026-11-09', '2026-11-10', `&tag=${encodeURIComponent('ทีม')}`),
    ).toHaveLength(1);
    expect(await range(a, '2026-11-09', '2026-11-10', '&tag=none')).toHaveLength(0);
  });
  it('ไม่ขยายเมื่อไม่ระบุช่วง และไม่ขยายงานที่ไม่มีวัน', async () => {
    const p = await mk(a, WEEKLY);
    await mk(a, { title: 'ไม่มีวัน', recurrenceRule: 'FREQ=DAILY' });
    const all = (await a.call('GET', '/api/tasks')).json.tasks as T[];
    expect(all.map((t) => t.id)).toContain(p.id);
    expect(all.some((t) => t.id.includes('~'))).toBe(false);
    expect(
      (await range(a, '2026-11-02', '2026-12-01')).filter((t) => t.title === 'ไม่มีวัน'),
    ).toHaveLength(0);
  });
  it('ผู้ใช้อื่นไม่เห็นซีรีส์ของเรา', async () => {
    await mk(a, WEEKLY);
    expect(await range(b, '2026-11-02', '2026-12-01')).toHaveLength(0);
  });
  it('แก้ไขงานแม่ → instance เสมือนที่ยังไม่แก้เปลี่ยนตาม', async () => {
    const p = await mk(a, WEEKLY);
    await a.call('PATCH', `/api/tasks/${p.id}`, {
      title: 'ชื่อใหม่',
      startAt: iso('11:00', '2026-11-02'),
      endAt: iso('12:00', '2026-11-02'),
    });
    const v = (await range(a, '2026-11-09', '2026-11-10'))[0]!;
    expect(v).toMatchObject({ title: 'ชื่อใหม่', startAt: iso('11:00', '2026-11-09') });
  });
});

describe('อ่าน/ตรวจ id เสมือน', () => {
  it('GET instance เสมือนได้ แต่วันที่ที่กฎไม่ให้ผล/id มั่ว/ของผู้ใช้อื่น = 404 และไม่สร้างแถว', async () => {
    const p = await mk(a, WEEKLY);
    expect((await get(a, vid(p.id, '2026-11-09'))).title).toBe('ประชุมทีม');
    for (const id of [
      vid(p.id, '2026-11-10'),
      vid(p.id, '2026-11-02'),
      vid(p.id, '2026-10-26'),
      vid(p.id, '2999-01-01'),
      `${p.id}~not-a-date`,
      'x~2026-11-09',
      vid('00000000-0000-0000-0000-000000000000', '2026-11-09'),
    ]) {
      expect((await a.call('GET', `/api/tasks/${encodeURIComponent(id)}`)).status, id).toBe(404);
      expect(
        (await a.call('PATCH', `/api/tasks/${encodeURIComponent(id)}`, { title: 'x' })).status,
        id,
      ).toBe(404);
    }
    expect(
      (await b.call('GET', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}`)).status,
    ).toBe(404);
    expect(
      (
        await b.call('PATCH', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}`, {
          title: 'hack',
        })
      ).status,
    ).toBe(404);
    expect(await dbRows('select id from tasks')).toHaveLength(1); // ไม่มีแถวเกินมา
  });
  it('งานที่ไม่ใช่ซีรีส์ ใช้ id เสมือนไม่ได้', async () => {
    const t = await mk(a, { title: 'ปกติ', startAt: iso('09:00') });
    expect(
      (await a.call('GET', `/api/tasks/${encodeURIComponent(vid(t.id, '2026-11-09'))}`)).status,
    ).toBe(404);
  });
});

describe('สร้างแถวจริงเมื่อแก้/เสร็จ/เลื่อน', () => {
  it('แก้ instance → สร้างแถวจริง 1 แถว ซ่อน instance เสมือนของวันนั้น ไม่กระทบครั้งอื่น/แม่', async () => {
    const p = await mk(a, WEEKLY);
    const r = await a.call('PATCH', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}`, {
      title: 'ครั้งนี้พิเศษ',
      startAt: iso('13:00', '2026-11-09'),
      endAt: iso('14:00', '2026-11-09'),
    });
    expect(r.status).toBe(200);
    const child = r.json.task as T;
    expect(child.id).not.toContain('~');
    expect(child).toMatchObject({
      parentTaskId: p.id,
      recurrenceId: '2026-11-09',
      recurrenceRule: null,
      title: 'ครั้งนี้พิเศษ',
      tags: ['ทีม'],
    });
    const list = await range(a, '2026-11-02', '2026-11-24');
    expect(list.map((t) => t.id)).toEqual([
      p.id,
      child.id,
      vid(p.id, '2026-11-16'),
      vid(p.id, '2026-11-23'),
    ]);
    expect((await get(a, p.id)).title).toBe('ประชุมทีม');
    // แก้ซ้ำด้วย id เสมือนเดิม = แถวจริงเดิม (ไม่สร้างซ้ำ)
    const r2 = await a.call('PATCH', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}`, {
      description: 'เพิ่มรายละเอียด',
    });
    expect(r2.json.task.id).toBe(child.id);
    expect(r2.json.task.title).toBe('ครั้งนี้พิเศษ');
    expect(await dbRows('select id from tasks')).toHaveLength(2);
  });
  it('เรียกพร้อมกัน (race) สร้างแถวเดียว', async () => {
    const p = await mk(a, WEEKLY);
    const id = encodeURIComponent(vid(p.id, '2026-11-16'));
    const rs = await Promise.all(
      [1, 2, 3].map((i) => a.call('PATCH', `/api/tasks/${id}`, { description: `d${i}` })),
    );
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(new Set(rs.map((r) => r.json.task.id)).size).toBe(1);
    expect(await dbRows('select id from tasks where parent_task_id is not null')).toHaveLength(1);
  });
  it('ทำเสร็จ instance → แถวจริงเป็น done เฉพาะครั้งนั้น', async () => {
    const p = await mk(a, WEEKLY);
    const done = (
      await a.call('POST', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}/complete`)
    ).json.task as T;
    expect(done).toMatchObject({ status: 'done', recurrenceId: '2026-11-09' });
    const list = await range(a, '2026-11-02', '2026-11-24');
    expect(list.find((t) => t.id === done.id)!.status).toBe('done');
    expect(list.find((t) => t.id === vid(p.id, '2026-11-16'))!.status).toBe('todo');
    expect((await get(a, p.id)).status).toBe('todo');
  });
  it('เลื่อน (snooze) instance → ย้ายเฉพาะครั้งนั้น', async () => {
    const p = await mk(a, WEEKLY);
    const moved = (
      await a.call('POST', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}/snooze`, {
        days: 1,
      })
    ).json.task as T;
    expect(moved.startAt).toBe(iso('09:00', '2026-11-10'));
    expect(moved.recurrenceId).toBe('2026-11-09'); // ยังนับเป็นครั้งของวันที่ 9 (ไม่มี instance เสมือนกลับมา)
    const list = await range(a, '2026-11-02', '2026-11-12');
    expect(list.filter((t) => t.title === 'ประชุมทีม')).toHaveLength(2); // แม่ (2) + แถวที่ย้ายไป 10
  });
  it('POST /materialize: instance → แถวจริง (idempotent), งานปกติ → ตัวเอง', async () => {
    const p = await mk(a, WEEKLY);
    const id = encodeURIComponent(vid(p.id, '2026-11-23'));
    const m1 = (await a.call('POST', `/api/tasks/${id}/materialize`)).json.task as T;
    const m2 = (await a.call('POST', `/api/tasks/${id}/materialize`)).json.task as T;
    expect(m1.id).toBe(m2.id);
    expect(m1.recurrenceId).toBe('2026-11-23');
    const plain = await mk(a, { title: 'ปกติ', startAt: iso('09:00') });
    expect(((await a.call('POST', `/api/tasks/${plain.id}/materialize`)).json.task as T).id).toBe(
      plain.id,
    );
    expect((await b.call('POST', `/api/tasks/${id}/materialize`)).status).toBe(404);
  });
  it('ห้ามตั้งการทำซ้ำบนแถวลูกของซีรีส์', async () => {
    const p = await mk(a, WEEKLY);
    const child = (
      await a.call('PATCH', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}`, {
        title: 'x',
      })
    ).json.task as T;
    const r = await a.call('PATCH', `/api/tasks/${child.id}`, { recurrenceRule: 'FREQ=DAILY' });
    expect(r.status).toBe(400);
  });
  it('แถวที่สร้างจริงไม่ถูกกระทบเมื่อแก้งานแม่ภายหลัง', async () => {
    const p = await mk(a, WEEKLY);
    const child = (
      await a.call('PATCH', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}`, {
        description: 'x',
      })
    ).json.task as T;
    await a.call('PATCH', `/api/tasks/${p.id}`, { title: 'แม่เปลี่ยนชื่อ' });
    expect((await get(a, child.id)).title).toBe('ประชุมทีม');
  });
});

describe('ลบงานทำซ้ำ', () => {
  it('ลบเฉพาะครั้งนี้ (instance เสมือน) → แถวยกเลิก instance ไม่กลับมา ครั้งอื่นยังอยู่', async () => {
    const p = await mk(a, WEEKLY);
    expect(
      (await a.call('DELETE', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}`)).status,
    ).toBe(200);
    const list = await range(a, '2026-11-02', '2026-11-24');
    expect(list.map((t) => `${t.recurrenceId ?? 'parent'}:${t.status}`)).toEqual([
      'parent:todo',
      '2026-11-09:cancelled',
      '2026-11-16:todo',
      '2026-11-23:todo',
    ]);
  });
  it('ลบเฉพาะครั้งนี้ ของแถวจริง และของแม่ (ครั้งแรก) → ยกเลิก ซีรีส์ยังต่อ', async () => {
    const p = await mk(a, WEEKLY);
    const child = (
      await a.call('PATCH', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}`, {
        description: 'x',
      })
    ).json.task as T;
    await a.call('DELETE', `/api/tasks/${child.id}`);
    expect((await get(a, child.id)).status).toBe('cancelled');
    await a.call('DELETE', `/api/tasks/${p.id}`);
    expect((await get(a, p.id)).status).toBe('cancelled');
    const list = await range(a, '2026-11-02', '2026-11-24');
    expect(list.filter((t) => t.status === 'todo').map((t) => t.recurrenceId)).toEqual([
      '2026-11-16',
      '2026-11-23',
    ]);
  });
  it('ลบทั้งซีรีส์ (scope=series) จาก instance/แถวจริง/แม่ → ลบแม่+ลูก+ไฟล์+checklist ไม่เหลืออะไร', async () => {
    for (const via of ['virtual', 'child', 'parent'] as const) {
      const p = await mk(a, WEEKLY);
      const child = (
        await a.call('PATCH', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}`, {
          description: 'x',
        })
      ).json.task as T;
      await a.upload(`/api/tasks/${child.id}/attachments`, [{ name: 'a.pdf', data: PDF }]);
      await a.call('POST', `/api/tasks/${p.id}/subtasks`, { title: 'ย่อย' });
      const target =
        via === 'virtual'
          ? encodeURIComponent(vid(p.id, '2026-11-16'))
          : via === 'child'
            ? child.id
            : p.id;
      expect((await a.call('DELETE', `/api/tasks/${target}?scope=series`)).status, via).toBe(200);
      expect(await dbRows('select id from tasks'), via).toHaveLength(0);
      expect(await dbRows('select id from subtasks'), via).toHaveLength(0);
      expect((env.FILES as unknown as { keys(): string[] }).keys(), via).toHaveLength(0);
      expect(await range(a, '2026-11-02', '2026-12-30'), via).toHaveLength(0);
    }
  });
  it('ลบซีรีส์ของผู้ใช้อื่นไม่ได้', async () => {
    const p = await mk(a, WEEKLY);
    expect((await b.call('DELETE', `/api/tasks/${p.id}?scope=series`)).status).toBe(404);
    expect(
      (
        await b.call(
          'DELETE',
          `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}?scope=series`,
        )
      ).status,
    ).toBe(404);
    expect(await dbRows('select id from tasks')).toHaveLength(1);
  });
  it('งานปกติยังลบจริงเหมือนเดิม', async () => {
    const t = await mk(a, { title: 'ปกติ', startAt: iso('09:00') });
    await a.call('DELETE', `/api/tasks/${t.id}`);
    expect(await dbRows('select id from tasks')).toHaveLength(0);
  });
});

describe('วันนี้ / Inbox กับงานทำซ้ำ', () => {
  it('ครั้งของวันนี้อยู่ใน /api/today; ครั้งที่ผ่านมาไม่ท่วมงานเลยกำหนด', async () => {
    const p = await mk(a, {
      title: 'ทบทวนประจำวัน',
      startAt: iso('15:00', '2026-10-25'),
      recurrenceRule: 'FREQ=DAILY',
    });
    const r = (await a.call('GET', '/api/today')).json;
    expect(r.today.map((t: T) => t.id)).toEqual([vid(p.id, DAY)]);
    // แถวจริงของครั้งแรกที่ยังไม่ทำ (25 ต.ค.) ไม่ใช่ "เลยกำหนด" เพราะไม่มี due; ครั้งเสมือนที่ผ่านมาไม่โผล่
    expect(r.overdue).toHaveLength(0);
    expect(r.today).toHaveLength(1);
    await a.call('POST', `/api/tasks/${encodeURIComponent(vid(p.id, DAY))}/complete`);
    expect((await a.call('GET', '/api/today')).json.today).toHaveLength(0);
  });
  it('งานทำซ้ำไม่อยู่ใน Inbox และการ "เลื่อนงานค้าง" ไม่ขยับงานทำซ้ำ', async () => {
    const p = await mk(a, { title: 'ซีรีส์', startAt: iso('21:00'), recurrenceRule: 'FREQ=DAILY' });
    const plain = await mk(a, { title: 'ปกติค้าง', startAt: iso('21:00') });
    expect(((await a.call('GET', '/api/inbox')).json.tasks as T[]).length).toBe(0);
    const line = new LineHarness(env);
    const code = (await a.call('POST', '/api/line/link-code')).json.code;
    await line.say(LA, `ผูกบัญชี ${code}`);
    await line.postback(LA, `a=carry&d=${DAY}`);
    expect((await get(a, plain.id)).startAt).toBe(iso('21:00', '2026-11-05'));
    expect((await get(a, p.id)).startAt).toBe(iso('21:00')); // ซีรีส์ไม่ถูกเลื่อน
  });
});

describe('Subtasks (checklist)', () => {
  it('เพิ่ม/ติ๊ก/แก้ชื่อ/ลบ และสรุปจำนวนใน task DTO', async () => {
    const t = await mk(a, { title: 'งาน', startAt: iso('14:00') });
    const s1 = (await a.call('POST', `/api/tasks/${t.id}/subtasks`, { title: '  เตรียมสไลด์ ' }))
      .json.subtask;
    const s2 = (await a.call('POST', `/api/tasks/${t.id}/subtasks`, { title: 'ซ้อมพูด' })).json
      .subtask;
    expect(s1).toMatchObject({ title: 'เตรียมสไลด์', done: false });
    expect(s2.sortOrder).toBeGreaterThan(s1.sortOrder);
    await a.call('PATCH', `/api/subtasks/${s1.id}`, { done: true });
    expect(
      (
        (await a.call('GET', `/api/tasks/${t.id}/subtasks`)).json.subtasks as { done: boolean }[]
      ).map((x) => x.done),
    ).toEqual([true, false]);
    expect(await get(a, t.id)).toMatchObject({ subtaskTotal: 2, subtaskDone: 1 });
    expect(
      (await a.call('PATCH', `/api/subtasks/${s2.id}`, { title: 'ซ้อมพูด 2 รอบ' })).json.subtask
        .title,
    ).toBe('ซ้อมพูด 2 รอบ');
    await a.call('DELETE', `/api/subtasks/${s1.id}`);
    expect(await get(a, t.id)).toMatchObject({ subtaskTotal: 1, subtaskDone: 0 });
    expect(((await range(a, DAY, '2026-11-05')).find((x) => x.id === t.id) as T).subtaskTotal).toBe(
      1,
    );
  });
  it('ตรวจข้อมูล: ชื่อว่าง/ยาวเกิน/key แปลก, จำกัด 50 รายการ', async () => {
    const t = await mk(a, { title: 'งาน' });
    expect((await a.call('POST', `/api/tasks/${t.id}/subtasks`, { title: '   ' })).status).toBe(
      400,
    );
    expect(
      (await a.call('POST', `/api/tasks/${t.id}/subtasks`, { title: 'x'.repeat(201) })).status,
    ).toBe(400);
    const s = (await a.call('POST', `/api/tasks/${t.id}/subtasks`, { title: 'ok' })).json.subtask;
    expect((await a.call('PATCH', `/api/subtasks/${s.id}`, { done: 'yes' })).status).toBe(400);
    expect((await a.call('PATCH', `/api/subtasks/${s.id}`, { taskId: 'other' })).status).toBe(400);
    for (let i = 0; i < 49; i++)
      await a.call('POST', `/api/tasks/${t.id}/subtasks`, { title: `s${i}` });
    const over = await a.call('POST', `/api/tasks/${t.id}/subtasks`, { title: 'เกิน' });
    expect(over.status).toBe(400);
    expect(over.json.error.code).toBe('too_many_subtasks');
  });
  it('สิทธิ์: ผู้ใช้อื่นเพิ่ม/แก้/ลบ/อ่านรายการย่อยของเราไม่ได้; ต้องล็อกอิน; ตรวจ Origin', async () => {
    const t = await mk(a, { title: 'งาน' });
    const s = (await a.call('POST', `/api/tasks/${t.id}/subtasks`, { title: 'ลับ' })).json.subtask;
    expect((await b.call('GET', `/api/tasks/${t.id}/subtasks`)).status).toBe(404);
    expect((await b.call('POST', `/api/tasks/${t.id}/subtasks`, { title: 'x' })).status).toBe(404);
    expect((await b.call('PATCH', `/api/subtasks/${s.id}`, { done: true })).status).toBe(404);
    expect((await b.call('DELETE', `/api/subtasks/${s.id}`)).status).toBe(404);
    expect((await new Client(env).call('GET', `/api/tasks/${t.id}/subtasks`)).status).toBe(401);
    expect(
      (
        await a.call('DELETE', `/api/subtasks/${s.id}`, undefined, {
          Origin: 'https://evil.example',
        })
      ).status,
    ).toBe(403);
    expect(await dbRows('select id from subtasks')).toHaveLength(1);
  });
  it('ลบงาน → ลบรายการย่อยด้วย', async () => {
    const t = await mk(a, { title: 'งาน' });
    await a.call('POST', `/api/tasks/${t.id}/subtasks`, { title: 'x' });
    await a.call('DELETE', `/api/tasks/${t.id}`);
    expect(await dbRows('select id from subtasks')).toHaveLength(0);
  });
  it('งานทำซ้ำ: instance เสมือนเห็น checklist ของแม่เป็นแม่แบบ; เพิ่ม/ติ๊กแล้วสร้างแถวจริงที่คัดลอกรายการมา (ไม่ติ๊ก) และไม่กระทบแม่', async () => {
    const p = await mk(a, WEEKLY);
    await a.call('POST', `/api/tasks/${p.id}/subtasks`, { title: 'เตรียมวาระ' });
    const id = encodeURIComponent(vid(p.id, '2026-11-09'));
    const tpl = (await a.call('GET', `/api/tasks/${id}/subtasks`)).json;
    expect(tpl).toMatchObject({ template: true, subtasks: [{ title: 'เตรียมวาระ', done: false }] });
    expect((await get(a, vid(p.id, '2026-11-09'))).subtaskTotal).toBe(1);
    const add = (await a.call('POST', `/api/tasks/${id}/subtasks`, { title: 'เฉพาะครั้งนี้' }))
      .json;
    expect(add.taskId).not.toContain('~');
    const own = (await a.call('GET', `/api/tasks/${add.taskId}/subtasks`)).json;
    expect(own.template).toBe(false);
    expect(own.subtasks.map((s: { title: string }) => s.title)).toEqual([
      'เตรียมวาระ',
      'เฉพาะครั้งนี้',
    ]);
    await a.call('PATCH', `/api/subtasks/${own.subtasks[0].id}`, { done: true });
    expect((await a.call('GET', `/api/tasks/${p.id}/subtasks`)).json.subtasks).toMatchObject([
      { title: 'เตรียมวาระ', done: false },
    ]);
  });
});

describe('ไฟล์แนบกับ instance เสมือน', () => {
  it('แนบไฟล์ให้ instance → สร้างแถวจริงแล้วแนบที่แถวนั้น', async () => {
    const p = await mk(a, WEEKLY);
    const r = await a.upload(
      `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}/attachments`,
      [{ name: 'a.pdf', data: PDF }],
    );
    expect(r.status).toBe(201);
    const taskId = r.json.taskId as string;
    expect(taskId).not.toContain('~');
    expect((await get(a, taskId)).attachmentCount).toBe(1);
    expect((await get(a, p.id)).attachmentCount).toBe(0);
    expect(
      (await a.call('GET', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-16'))}/attachments`))
        .json.attachments,
    ).toHaveLength(0);
  });
});

describe('Google Calendar กับซีรีส์', () => {
  let g: FakeGoogle;
  beforeEach(async () => {
    g = new FakeGoogle();
    const r1 = await a.raw('GET', '/auth/google/connect');
    const state = new URL(r1.headers.get('location')!).searchParams.get('state')!;
    const sc = (r1.headers.get('set-cookie') ?? '').split(';')[0]!;
    await a.raw('GET', `/auth/google/callback?code=abc&state=${state}`, {
      Cookie: `${a.cookie}; ${sc}`,
    });
  });
  const ev = (id: string) => g.byTask(id);

  it('งานแม่ส่งเป็น event ที่มี RRULE; ทำเสร็จครั้งแรกไม่ใส่ ✅ ให้ทั้งซีรีส์', async () => {
    const p = await mk(a, WEEKLY);
    expect(ev(p.id)!.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO']);
    await a.call('POST', `/api/tasks/${p.id}/complete`);
    expect(ev(p.id)!.summary).toBe('ประชุมทีม'); // ไม่มี ✅
  });
  it('แก้/ทำเสร็จ/ยกเลิกเฉพาะครั้ง → event ของครั้งนั้นแยก + EXDATE ที่งานแม่', async () => {
    const p = await mk(a, WEEKLY);
    const done = (
      await a.call('POST', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}/complete`)
    ).json.task as T;
    expect(ev(done.id)!.summary).toBe('✅ ประชุมทีม');
    expect(ev(done.id)!.start).toMatchObject({ dateTime: '2026-11-09T09:00:00+07:00' });
    expect(ev(done.id)!.recurrence).toBeUndefined(); // ไม่ใช่ซีรีส์
    expect(ev(p.id)!.recurrence).toEqual([
      'RRULE:FREQ=WEEKLY;BYDAY=MO',
      'EXDATE;TZID=Asia/Bangkok:20261109T090000',
    ]);
    // เลื่อนครั้งที่ 16 ไปวันอังคาร → event แยกที่วันใหม่ + EXDATE ของวันที่ 16 เดิม
    const moved = (
      await a.call('PATCH', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-16'))}`, {
        startAt: iso('09:00', '2026-11-17'),
        endAt: iso('10:00', '2026-11-17'),
      })
    ).json.task as T;
    expect(ev(moved.id)!.start).toMatchObject({ dateTime: '2026-11-17T09:00:00+07:00' });
    expect(ev(p.id)!.recurrence).toEqual([
      'RRULE:FREQ=WEEKLY;BYDAY=MO',
      'EXDATE;TZID=Asia/Bangkok:20261109T090000',
      'EXDATE;TZID=Asia/Bangkok:20261116T090000',
    ]);
    // ยกเลิกครั้งที่ 23 → ไม่มี event ของครั้งนั้น และมี EXDATE
    await a.call('DELETE', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-23'))}`);
    expect(g.all.filter((e) => String(e.summary).includes('ประชุมทีม'))).toHaveLength(3); // แม่ + ครั้ง 9 + ครั้ง 16(ย้าย)
    expect((ev(p.id)!.recurrence as string[]).at(-1)).toBe(
      'EXDATE;TZID=Asia/Bangkok:20261123T090000',
    );
  });
  it('งานทั้งวัน: EXDATE แบบ VALUE=DATE', async () => {
    const p = await mk(a, {
      title: 'รายวัน',
      allDay: true,
      dueDate: '2026-11-04',
      recurrenceRule: 'FREQ=DAILY',
    });
    await a.call('DELETE', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-06'))}`);
    expect(ev(p.id)!.recurrence).toEqual(['RRULE:FREQ=DAILY', 'EXDATE;VALUE=DATE:20261106']);
  });
  it('ลบ "เฉพาะครั้งนี้" ของงานแม่ไม่ลบทั้งซีรีส์ใน Google; ลบทั้งซีรีส์ลบ event ของทุกครั้ง', async () => {
    const p = await mk(a, WEEKLY);
    await a.call('DELETE', `/api/tasks/${p.id}`);
    expect(ev(p.id)).toBeDefined();
    const child = (
      await a.call('POST', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-09'))}/complete`)
    ).json.task as T;
    expect(ev(child.id)).toBeDefined();
    await a.call('DELETE', `/api/tasks/${p.id}?scope=series`);
    expect(g.all).toHaveLength(0);
  });
});

describe('LINE กับงานทำซ้ำ', () => {
  let line: LineHarness;
  beforeEach(async () => {
    line = new LineHarness(env);
    const code = (await a.call('POST', '/api/line/link-code')).json.code;
    await line.say(LA, `ผูกบัญชี ${code}`);
  });
  const last = () => json(line.replies.at(-1));
  it('สร้าง "ทุกวัน 15:00" แล้วเห็นครั้งของวันนี้/พรุ่งนี้ใน "วันนี้/พรุ่งนี้" และติ๊กเสร็จด้วยเลข', async () => {
    await line.say(LA, 'ทบทวนบทเรียน ทุกวัน 15:00');
    const p = ((await a.call('GET', '/api/tasks')).json.tasks as T[])[0]!;
    expect(p.recurrenceRule).toBe('FREQ=DAILY');
    await line.say(LA, 'พรุ่งนี้');
    expect(last()).toContain('ทบทวนบทเรียน');
    await line.say(LA, 'เสร็จ 1'); // เลข 1 = instance เสมือนของพรุ่งนี้
    expect(last()).toContain('เสร็จแล้ว');
    const list = await range(a, '2026-11-04', '2026-11-07');
    expect(list.find((t) => t.recurrenceId === '2026-11-05')!.status).toBe('done');
    expect(list.find((t) => t.id === vid(p.id, '2026-11-06'))!.status).toBe('todo');
  });
  it('ลบผ่าน LINE = ลบเฉพาะครั้งนั้น', async () => {
    await line.say(LA, 'ฝึกพูด ทุกวัน 15:00');
    const p = ((await a.call('GET', '/api/tasks')).json.tasks as T[])[0]!;
    await line.say(LA, 'พรุ่งนี้');
    await line.say(LA, 'ลบ 1');
    const delok = [...JSON.stringify(line.replies.at(-1)).matchAll(/"data":"(a=delok[^"]+)"/g)].map(
      (m) => m[1]!,
    );
    await line.postback(LA, delok[0]!);
    const list = await range(a, '2026-11-04', '2026-11-08');
    expect(list.find((t) => t.recurrenceId === '2026-11-05')!.status).toBe('cancelled');
    expect(list.find((t) => t.id === vid(p.id, '2026-11-06'))).toBeDefined();
  });
});

describe('แจ้งเตือนก่อนเวลาของงานทำซ้ำ', () => {
  let line: LineHarness;
  beforeEach(async () => {
    line = new LineHarness(env);
    const code = (await a.call('POST', '/api/line/link-code')).json.code;
    await line.say(LA, `ผูกบัญชี ${code}`);
    line.pushes.length = 0;
  });
  it('เตือนครั้งเสมือน (ปุ่ม ✅ ใช้ id เสมือนได้) ครั้งเดียว แม้ผู้ใช้แก้ครั้งนั้นระหว่างทาง', async () => {
    const p = await mk(a, {
      title: 'ประชุมประจำวัน',
      startAt: iso('14:00'),
      recurrenceRule: 'FREQ=DAILY',
    });
    at('13:35', '2026-11-05');
    await runNotifications(env);
    expect(line.pushes).toHaveLength(1);
    expect(json(line.pushes[0]!.messages)).toContain(`a=done&id=${p.id}~2026-11-05`);
    // ผู้ใช้แก้ครั้งนี้ (กลายเป็นแถวจริง ยังไม่เสร็จ เวลาเดิม) → ไม่เตือนซ้ำ เพราะคีย์ผูกกับ "ครั้งที่ของซีรีส์"
    await a.call('PATCH', `/api/tasks/${encodeURIComponent(vid(p.id, '2026-11-05'))}`, {
      description: 'เพิ่มรายละเอียด',
    });
    at('13:45', '2026-11-05');
    await runNotifications(env);
    expect(line.pushes).toHaveLength(1);
    // แต่ถ้าเลื่อนเวลาจริง ถือเป็นนัดใหม่ → เตือนใหม่ตามเวลาใหม่
    const child = ((await a.call('GET', '/api/tasks')).json.tasks as T[]).find(
      (t) => t.recurrenceId === '2026-11-05',
    )!;
    await a.call('PATCH', `/api/tasks/${child.id}`, { startAt: iso('15:00', '2026-11-05') });
    at('14:40', '2026-11-05');
    await runNotifications(env);
    expect(line.pushes).toHaveLength(2);
  });
  it('กดปุ่ม ✅ จากข้อความเตือน (id เสมือน) ทำให้ครั้งนั้นเสร็จ', async () => {
    const p = await mk(a, {
      title: 'ประชุมประจำวัน',
      startAt: iso('14:00'),
      recurrenceRule: 'FREQ=DAILY',
    });
    at('13:35', '2026-11-05');
    await runNotifications(env);
    await line.postback(LA, `a=done&id=${p.id}~2026-11-05`);
    const list = await range(a, '2026-11-05', '2026-11-06');
    expect(list.find((t) => t.recurrenceId === '2026-11-05')!.status).toBe('done');
  });
});

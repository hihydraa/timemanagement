import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';
import { freezeNow } from '../src/lib/time';
import { Client, makeEnv } from './helpers/app';

/**
 * Isolation sweep: วนยิง "ทุก route" ของ /api (ดึงจาก app.routes) ในฐานะผู้ใช้ B
 * ด้วย id ทุกชนิดของผู้ใช้ A แล้วตรวจว่า (1) ไม่สำเร็จ (2) ไม่มีข้อมูลของ A หลุดในผลลัพธ์ (3) ข้อมูลของ A ไม่เปลี่ยน
 * และ (4) ทุก route ต้องล็อกอิน
 */
const NOW = new Date('2026-11-04T03:00:00Z');
const PDF = new TextEncoder().encode('%PDF-1.4 MARK');
const iso = (hm: string, date = '2026-11-04') => new Date(`${date}T${hm}:00+07:00`).toISOString();

let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;
const ids: Record<string, string> = {};

const routes = (() => {
  const seen = new Set<string>();
  const out: { method: string; path: string }[] = [];
  for (const r of app.routes) {
    // เส้นทางสาธารณะโดยตั้งใจ: health และ session (ตอบ { user: null } เมื่อไม่ได้ล็อกอิน)
    if (
      r.method === 'ALL' ||
      !r.path.startsWith('/api/') ||
      r.path === '/api/health' ||
      r.path === '/api/session'
    )
      continue;
    const k = `${r.method} ${r.path}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ method: r.method, path: r.path });
    }
  }
  return out;
})();

beforeEach(async () => {
  freezeNow(NOW);
  env = makeEnv();
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');

  ids.cat = (
    await a.call('POST', '/api/categories', { name: 'MARK-CAT', color: '#112233' })
  ).json.category.id;
  ids.task = (
    await a.call('POST', '/api/tasks', {
      title: 'MARK-TASK',
      description: 'MARK-DESC',
      tags: ['MARK-TAG'],
      categoryId: ids.cat,
      startAt: iso('09:00'),
      estimateMinutes: 30,
    })
  ).json.task.id;
  ids.series = (
    await a.call('POST', '/api/tasks', {
      title: 'MARK-SERIES',
      startAt: iso('10:00'),
      recurrenceRule: 'FREQ=DAILY',
    })
  ).json.task.id;
  ids.virtual = `${ids.series}~2026-11-05`;
  ids.child = (
    await a.call('PATCH', `/api/tasks/${encodeURIComponent(`${ids.series}~2026-11-06`)}`, {
      description: 'MARK-CHILD',
    })
  ).json.task.id;
  ids.sub = (
    await a.call('POST', `/api/tasks/${ids.task}/subtasks`, { title: 'MARK-SUB' })
  ).json.subtask.id;
  ids.att = (
    await a.upload(`/api/tasks/${ids.task}/attachments`, [{ name: 'MARK-FILE.pdf', data: PDF }])
  ).json.attachments[0].id;
  await a
    .call('POST', '/api/focus-sessions', {
      taskId: ids.task,
      startedAt: iso('11:00', '2026-11-04').replace('04:00', '03:00'),
      endedAt: new Date(NOW.getTime() - 60_000).toISOString(),
      minutes: 5,
    })
    .catch(() => undefined);
});
afterEach(() => {
  freezeNow(null);
  vi.unstubAllGlobals();
});

const snapshot = async (c: Client) => {
  const res = await c.raw('GET', '/api/export?format=json');
  const d = JSON.parse(await res.text());
  delete d.exportedAt;
  return JSON.stringify(d);
};

const bodyFor = (method: string, path: string): unknown => {
  if (method === 'PATCH' && /\/tasks\/:id$/.test(path))
    return { title: 'HACK', status: 'cancelled' };
  if (/\/snooze$/.test(path)) return { days: 1 };
  if (/\/subtasks$/.test(path)) return { title: 'HACK' };
  if (method === 'PATCH' && /\/subtasks\/:id$/.test(path)) return { done: true };
  if (method === 'PATCH' && /\/categories\/:id$/.test(path)) return { name: 'HACK' };
  return {};
};

describe('isolation sweep', () => {
  it('route ทั้งหมดใช้พารามิเตอร์ชื่อ :id เท่านั้น (ถ้ามีชื่ออื่นต้องเพิ่มเคสใน test นี้)', () => {
    const other = routes.filter((r) => /:(?!id\b)\w+/.test(r.path));
    expect(other).toEqual([]);
    expect(routes.length).toBeGreaterThanOrEqual(38); // ถ้าลดลง = enumerate route ผิดพลาด
  });

  it('ทุก route ของ /api ต้องล็อกอิน (ไม่มี cookie = 401)', async () => {
    const anon = new Client(env);
    for (const r of routes) {
      const path = r.path.replace(/:id/g, ids.task!);
      const res = await anon.call(
        r.method,
        path,
        r.method === 'GET' || r.method === 'DELETE' ? undefined : {},
      );
      expect(res.status, `${r.method} ${r.path}`).toBe(401);
    }
  });

  it('ผู้ใช้ B ยิงทุก route ด้วย id ของ A: ไม่สำเร็จ, ไม่มีข้อมูล A หลุด, ข้อมูล A ไม่เปลี่ยน', async () => {
    const before = await snapshot(a);
    expect(before).toContain('MARK-TASK');
    const r2Before = (env.FILES as unknown as { keys(): string[] }).keys().length;
    const candidates = Object.values(ids);
    let calls = 0;

    for (const r of routes) {
      const hasId = r.path.includes(':id');
      const tries = hasId ? candidates : [''];
      for (const id of tries) {
        const path = r.path.replace(/:id/g, encodeURIComponent(id));
        let status: number;
        let text: string;
        if (r.method === 'POST' && /\/attachments$/.test(r.path)) {
          const res = await b.upload(path, [{ name: 'x.pdf', data: PDF }]);
          status = res.status;
          text = JSON.stringify(res.json);
        } else {
          const real = await b.call(
            r.method,
            path,
            r.method === 'GET' || r.method === 'DELETE' ? undefined : bodyFor(r.method, r.path),
          );
          status = real.status;
          text = JSON.stringify(real.json);
        }
        calls++;
        const label = `${r.method} ${path}`;
        expect(text, `${label} leaked A's data`).not.toContain('MARK-');
        if (hasId)
          expect(status, `${label} must fail for another user's id`).toBeGreaterThanOrEqual(400);
      }
    }
    expect(calls).toBeGreaterThanOrEqual(100);
    expect(await snapshot(a)).toBe(before); // ข้อมูลของ A ไม่เปลี่ยนเลย
    expect((env.FILES as unknown as { keys(): string[] }).keys().length).toBe(r2Before);
    expect((await a.call('GET', `/api/tasks/${ids.task}`)).json.task.title).toBe('MARK-TASK');
  });

  it('บันทึกโฟกัสด้วยงานของผู้ใช้อื่นไม่ได้', async () => {
    const r = await b.call('POST', '/api/focus-sessions', {
      taskId: ids.task,
      startedAt: new Date(NOW.getTime() - 600_000).toISOString(),
      endedAt: new Date(NOW.getTime() - 60_000).toISOString(),
      minutes: 5,
    });
    expect(r.status).toBe(404);
  });

  it('B เห็นเฉพาะข้อมูลของตัวเองในทุก GET ที่ไม่ต้องใช้ id', async () => {
    await b.call('POST', '/api/tasks', { title: 'B-ONLY', startAt: iso('13:00') });
    const from = encodeURIComponent(new Date('2026-11-01T00:00:00+07:00').toISOString());
    const to = encodeURIComponent(new Date('2026-12-01T00:00:00+07:00').toISOString());
    for (const p of [
      '/api/tasks',
      `/api/tasks?from=${from}&to=${to}`,
      '/api/today',
      '/api/inbox',
      '/api/matrix',
      '/api/categories',
      '/api/stats/weekly?week=2026-11-02',
      '/api/stats/overview',
      '/api/focus-sessions',
      '/api/settings',
      '/api/gcal/status',
      '/api/line/status',
      '/api/storage',
    ]) {
      const res = await b.call('GET', p);
      expect(res.status, p).toBe(200);
      expect(JSON.stringify(res.json), p).not.toContain('MARK-');
    }
    const cats = (await b.call('GET', '/api/categories')).json.categories as { name: string }[];
    expect(cats.some((c) => c.name === 'MARK-CAT')).toBe(false);
  });
});

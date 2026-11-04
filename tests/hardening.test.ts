import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';
import { getDb } from '../src/db/client';
import { hit, purgeRateLimits } from '../src/lib/rateLimit';
import { freezeNow } from '../src/lib/time';
import { Client, makeEnv } from './helpers/app';
import { LineHarness } from './helpers/line';

const NOW = new Date('2026-11-04T03:00:00Z');
let env: ReturnType<typeof makeEnv>;

beforeEach(() => {
  freezeNow(NOW);
  env = makeEnv();
});
afterEach(() => {
  freezeNow(null);
  vi.unstubAllGlobals();
});

const req = (path: string, init: RequestInit = {}, e = env) =>
  app.request(`http://localhost${path}`, init, e);
const rows = async (sql: string) =>
  (await env.DB.prepare(sql).all()).results as Record<string, unknown>[];

describe('rate limit: ตัวนับ', () => {
  it('นับต่อ key, เกินเพดานแล้วปฏิเสธ พร้อมเวลารอ; key อื่นไม่กระทบ', async () => {
    const db = getDb(env.DB);
    for (let i = 1; i <= 3; i++)
      expect(await hit(db, 'k1', 3, 60)).toMatchObject({ ok: true, count: i });
    const over = await hit(db, 'k1', 3, 60);
    expect(over.ok).toBe(false);
    expect(over.retryAfter).toBeGreaterThan(0);
    expect(over.retryAfter).toBeLessThanOrEqual(60);
    expect((await hit(db, 'k2', 3, 60)).ok).toBe(true);
  });
  it('เริ่มหน้าต่างใหม่แล้วนับใหม่', async () => {
    const db = getDb(env.DB);
    for (let i = 0; i < 4; i++) await hit(db, 'k', 3, 60);
    expect((await hit(db, 'k', 3, 60)).ok).toBe(false);
    freezeNow(new Date(NOW.getTime() + 61_000));
    expect(await hit(db, 'k', 3, 60)).toMatchObject({ ok: true, count: 1 });
  });
  it('purge ลบเฉพาะแถวที่หมดอายุ', async () => {
    const db = getDb(env.DB);
    await hit(db, 'old', 5, 60);
    freezeNow(new Date(NOW.getTime() + 3600_000));
    await hit(db, 'fresh', 5, 60);
    await purgeRateLimits(db);
    const keys = (await rows('select key from rate_limits')).map((r) => String(r.key));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^fresh:/);
  });
});

describe('rate limit: ที่ใช้งานจริง', () => {
  const login = (ip: string, e = env) =>
    req('/auth/dev-login?email=a@x.com', { headers: { 'CF-Connecting-IP': ip } }, e);

  it('login: เกิน 20 ครั้ง/นาที/IP → 429 + Retry-After; IP อื่นไม่กระทบ; ผ่านหน้าต่างแล้วใช้ได้อีก', async () => {
    for (let i = 0; i < 20; i++) expect((await login('1.1.1.1')).status).toBe(302);
    const blocked = await login('1.1.1.1');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe('rate_limited');
    expect((await login('2.2.2.2')).status).toBe(302);
    freezeNow(new Date(NOW.getTime() + 61_000));
    expect((await login('1.1.1.1')).status).toBe(302);
  });
  it('callback และ login ของ Google ใช้เพดานเดียวกัน (นับรวมต่อ IP)', async () => {
    for (let i = 0; i < 10; i++)
      await req('/auth/google/login', { headers: { 'CF-Connecting-IP': '3.3.3.3' } });
    for (let i = 0; i < 10; i++)
      await req('/auth/google/callback?code=x&state=y', {
        headers: { 'CF-Connecting-IP': '3.3.3.3' },
      });
    expect(
      (await req('/auth/google/login', { headers: { 'CF-Connecting-IP': '3.3.3.3' } })).status,
    ).toBe(429);
  });
  it('webhook LINE: เกิน 300/นาที/IP → 429 ก่อนตรวจลายเซ็น', async () => {
    const post = () =>
      req('/webhook/line', {
        method: 'POST',
        body: '{}',
        headers: { 'CF-Connecting-IP': '9.9.9.9', 'x-line-signature': 'bad' },
      });
    expect((await post()).status).toBe(401);
    for (let i = 0; i < 299; i++) await post();
    expect((await post()).status).toBe(429);
    const other = await req('/webhook/line', {
      method: 'POST',
      body: '{}',
      headers: { 'CF-Connecting-IP': '8.8.8.8', 'x-line-signature': 'bad' },
    });
    expect(other.status).toBe(401); // IP อื่นยังถึงขั้นตรวจลายเซ็น
  });
  it('webhook ที่ถูกต้องยังทำงานปกติภายใต้เพดาน', async () => {
    const h = new LineHarness(env);
    const r = await h.post(JSON.stringify({ events: [] }));
    expect(r.status).toBe(200);
  });
  it('ขอรหัสผูกบัญชี: 10 ครั้ง/10 นาที/ผู้ใช้', async () => {
    const a = new Client(env);
    const b = new Client(env);
    await a.login('a@x.com');
    await b.login('b@x.com');
    for (let i = 0; i < 10; i++)
      expect((await a.call('POST', '/api/line/link-code')).status).toBe(200);
    const r = await a.call('POST', '/api/line/link-code');
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe('rate_limited');
    expect((await b.call('POST', '/api/line/link-code')).status).toBe(200);
  });
  it('ตัวจำกัดใช้งานไม่ได้ (DB ผิดพลาด) → เปิดทางผ่าน ไม่ทำให้ login ล่ม', async () => {
    const real = env.DB;
    const flaky = {
      ...env,
      DB: {
        ...real,
        prepare: (sql: string) => {
          if (sql.includes('rate_limits')) throw new Error('db down');
          return real.prepare(sql);
        },
        batch: real.batch.bind(real),
        exec: real.exec.bind(real),
      },
    } as unknown as typeof env;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await login('4.4.4.4', flaky)).status).toBe(302);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('ข้อจำกัดอื่นของ API', () => {
  it('JSON ใหญ่เกิน 256 KB → 413; ปกติผ่าน', async () => {
    const a = new Client(env);
    await a.login('a@x.com');
    const big = await a.call('POST', '/api/tasks', {
      title: 'x',
      description: 'ก'.repeat(300_000),
    });
    expect(big.status).toBe(413);
    expect(big.json.error.code).toBe('request_too_large');
    expect(
      (await a.call('POST', '/api/tasks', { title: 'x', description: 'ก'.repeat(5000) })).status,
    ).toBe(201);
  });
  it('การอัปโหลดไฟล์ไม่ถูกเพดาน JSON (มีเพดานของตัวเอง)', async () => {
    const a = new Client(env);
    await a.login('a@x.com');
    const t = (await a.call('POST', '/api/tasks', { title: 'x' })).json.task.id;
    const pdf = new Uint8Array(400 * 1024);
    pdf.set(new TextEncoder().encode('%PDF-1.4'));
    expect(
      (await a.upload(`/api/tasks/${t}/attachments`, [{ name: 'a.pdf', data: pdf }])).status,
    ).toBe(201);
  });
  it('logout ตรวจ Origin (กัน logout ข้ามเว็บ) และไม่มี Origin/Origin ของแอปผ่าน', async () => {
    const a = new Client(env);
    await a.login('a@x.com');
    expect(
      (await a.call('POST', '/auth/logout', undefined, { Origin: 'https://evil.example' })).status,
    ).toBe(403);
    expect(
      (await a.call('POST', '/auth/logout', undefined, { Origin: 'http://localhost:5173' })).status,
    ).toBe(200);
    expect((await a.call('POST', '/auth/logout')).status).toBe(200);
  });
});

describe('SESSION_SECRET', () => {
  it('สั้นกว่า 32 ตัวอักษร/ไม่ตั้ง → ไม่ออก session และ session เดิมใช้ไม่ได้ (fail closed)', async () => {
    const good = new Client(env);
    await good.login('a@x.com');
    for (const secret of ['short', '']) {
      const weak = { ...env, SESSION_SECRET: secret } as typeof env;
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const res = await req('/auth/dev-login?email=a@x.com', {}, weak);
      expect(res.status).toBe(500);
      expect(res.headers.get('set-cookie')).toBeNull();
      const me = await req('/api/me', { headers: { Cookie: good.cookie } }, weak);
      expect(me.status).toBe(401);
      spy.mockRestore();
    }
    expect((await good.call('GET', '/api/me')).status).toBe(200); // ค่าที่ถูกต้องยังใช้ได้
  });
});

describe('GET /api/session', () => {
  it('ไม่ล็อกอิน = 200 { user: null } และห้าม cache', async () => {
    const res = await req('/api/session');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
  it('ล็อกอินแล้วได้ข้อมูลของตัวเองเท่านั้น', async () => {
    const c = new Client(env);
    await c.login('a@x.com');
    const res = await c.raw('GET', '/api/session');
    const j = (await res.json()) as { user: { email: string } | null };
    expect(j.user?.email).toBe('a@x.com');
  });
  it('cookie ปลอม = user null', async () => {
    const res = await req('/api/session', { headers: { cookie: 'dobby_session=garbage' } });
    expect(await res.json()).toEqual({ user: null });
  });
});

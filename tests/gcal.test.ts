import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptSecret } from '../src/lib/crypto';
import { freezeNow } from '../src/lib/time';
import { Client, makeEnv } from './helpers/app';
import { FakeGoogle, type GEvent } from './helpers/google';
import { LineHarness } from './helpers/line';

const NOW = new Date('2026-11-04T03:00:00Z'); // พุธ 4 พ.ย. 2026 10:00 น. (ไทย)
const LA = 'U' + 'a'.repeat(32);
const TIMED = {
  title: 'ส่งรายงาน',
  startAt: '2026-11-05T07:00:00Z',
  endAt: '2026-11-05T08:00:00Z',
};

let env: ReturnType<typeof makeEnv>;
let g: FakeGoogle;
let a: Client;
let b: Client;

async function connect(c: Client, fake: FakeGoogle = g) {
  const r1 = await c.raw('GET', '/auth/google/connect');
  const loc = new URL(r1.headers.get('location') ?? 'http://none');
  const state = loc.searchParams.get('state') ?? '';
  const stateCookie = (r1.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const r2 = await c.raw('GET', `/auth/google/callback?code=abc&state=${state}`, {
    Cookie: `${c.cookie}; ${stateCookie}`,
  });
  return { r1, r2, loc, state, stateCookie, fake };
}
const mk = async (c: Client, body: object = TIMED) =>
  (await c.call('POST', '/api/tasks', body)).json.task as {
    id: string;
    gcalEventId: string | null;
  };
const get = async (c: Client, id: string) =>
  (await c.call('GET', `/api/tasks/${id}`)).json.task as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = (id: string): GEvent => {
  const e = g.byTask(id);
  if (!e) throw new Error('no google event for task');
  return e;
};
const dbRows = async (sql: string) =>
  (await env.DB.prepare(sql).all()).results as Record<string, unknown>[];

beforeEach(async () => {
  freezeNow(NOW);
  env = makeEnv();
  g = new FakeGoogle();
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
});
afterEach(() => {
  freezeNow(null);
  vi.unstubAllGlobals();
});

describe('เชื่อม Google Calendar (OAuth)', () => {
  it('ต้องล็อกอินก่อน', async () => {
    const r = await new Client(env).raw('GET', '/auth/google/connect');
    expect(r.status).toBe(401);
  });
  it('redirect ไป Google ด้วย offline + consent + scope ปฏิทิน + state ใน cookie', async () => {
    const { r1, loc } = await connect(a);
    expect(r1.status).toBe(302);
    expect(loc.origin + loc.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(loc.searchParams.get('access_type')).toBe('offline');
    expect(loc.searchParams.get('prompt')).toBe('consent');
    expect(loc.searchParams.get('scope')).toContain(
      'https://www.googleapis.com/auth/calendar.events',
    );
    expect(loc.searchParams.get('scope')).toContain('openid email');
    expect(loc.searchParams.get('state')).toMatch(/^c\./);
    expect(r1.headers.get('set-cookie')).toMatch(/HttpOnly/);
  });
  it('state ไม่ตรง/ไม่มี cookie → 400 (กัน CSRF) และไม่บันทึก token', async () => {
    const r1 = await a.raw('GET', '/auth/google/connect');
    const state = new URL(r1.headers.get('location')!).searchParams.get('state')!;
    const none = await a.raw('GET', `/auth/google/callback?code=abc&state=${state}`);
    expect(none.status).toBe(400);
    const bad = await a.raw('GET', '/auth/google/callback?code=abc&state=c.forged', {
      Cookie: `${a.cookie}; dobby_oauth_state=c.other`,
    });
    expect(bad.status).toBe(400);
    expect((await a.call('GET', '/api/gcal/status')).json.connected).toBe(false);
  });
  it('สำเร็จ: เชื่อมแล้ว เก็บอีเมล เปิดซิงก์ และ token ถูกเข้ารหัส (ไม่มี plaintext)', async () => {
    const { r2 } = await connect(a);
    expect(r2.headers.get('location')).toBe('http://localhost:5173/?gcal=connected');
    const st = (await a.call('GET', '/api/gcal/status')).json;
    expect(st).toMatchObject({
      configured: true,
      connected: true,
      needsReconnect: false,
      email: 'a@x.com',
      syncEnabled: true,
      calendarId: 'primary',
    });
    const [row] = await dbRows('select * from google_tokens');
    expect(JSON.stringify(row)).not.toContain('rt-secret-value');
    expect(JSON.stringify(row)).not.toContain('at-1');
    expect(String(row!.refresh_token_enc)).toMatch(/^v1\./);
    const uid = ((await dbRows("select id from users where email='a@x.com'"))[0] as { id: string })
      .id;
    expect(await decryptSecret(String(row!.refresh_token_enc), env.TOKEN_ENC_KEY, uid)).toBe(
      'rt-secret-value',
    );
  });
  it('ไม่ให้สิทธิ์ปฏิทิน (granular consent) → error scope ไม่บันทึก', async () => {
    g.codeResponse = { scope: 'openid email' };
    const { r2 } = await connect(a);
    expect(r2.headers.get('location')).toContain('gcal=error&reason=scope');
    expect((await a.call('GET', '/api/gcal/status')).json.connected).toBe(false);
  });
  it('ไม่ได้ refresh token → error', async () => {
    g.codeResponse = { refresh_token: undefined };
    const { r2 } = await connect(a);
    expect(r2.headers.get('location')).toContain('reason=refresh');
    expect((await a.call('GET', '/api/gcal/status')).json.connected).toBe(false);
  });
  it('ผู้ใช้กดปฏิเสธ → redirect denied (ทั้ง connect และ login)', async () => {
    const { state, stateCookie } = await connect(a);
    const r = await a.raw('GET', `/auth/google/callback?error=access_denied&state=${state}`, {
      Cookie: `${a.cookie}; ${stateCookie}`,
    });
    expect(r.headers.get('location')).toContain('gcal=denied');
    const l = await new Client(env).raw('GET', '/auth/google/callback?error=access_denied');
    expect(l.headers.get('location')).toContain('login=denied');
  });
  it('callback ของ connect ต้องมี session', async () => {
    const { state, stateCookie } = await connect(a);
    const r = await new Client(env).raw('GET', `/auth/google/callback?code=abc&state=${state}`, {
      Cookie: stateCookie,
    });
    expect(r.status).toBe(401);
  });
  it('ไม่ได้ตั้งค่า TOKEN_ENC_KEY → ปฏิเสธ ไม่เก็บ token แบบ plaintext', async () => {
    const e2 = makeEnv({ TOKEN_ENC_KEY: '' });
    const c = new Client(e2);
    await c.login('a@x.com');
    expect((await c.raw('GET', '/auth/google/connect')).status).toBe(400);
    expect((await c.call('GET', '/api/gcal/status')).json.configured).toBe(false);
  });
  it('login ด้วย Google ยังทำงาน และจำกัดด้วย ALLOWED_EMAILS', async () => {
    const login = async (e: typeof env) => {
      const c = new Client(e);
      const r1 = await c.raw('GET', '/auth/google/login');
      const state = new URL(r1.headers.get('location')!).searchParams.get('state')!;
      expect(r1.headers.get('location')).not.toContain('calendar');
      const sc = (r1.headers.get('set-cookie') ?? '').split(';')[0]!;
      return c.raw('GET', `/auth/google/callback?code=abc&state=${state}`, { Cookie: sc });
    };
    g.email = 'a@x.com';
    const ok = await login(env);
    expect(ok.status).toBe(302);
    expect(ok.headers.get('set-cookie')).toContain('dobby_session=');
    g.email = 'stranger@x.com';
    const denied = await login(env);
    // ผู้ใช้เห็นหน้า login พร้อมเหตุผล (ไม่ใช่ JSON ดิบ) และไม่ได้ session
    expect(denied.status).toBe(302);
    expect(denied.headers.get('location')).toContain('login=not_allowed');
    expect(denied.headers.get('set-cookie') ?? '').not.toContain('dobby_session=');
  });
});

describe('ซิงก์งานไป Google Calendar', () => {
  beforeEach(async () => {
    await connect(a);
  });

  it('งานมีเวลา: วัน/เวลา/เขตเวลาถูกต้อง + ลิงก์กลับ + reminder + id', async () => {
    const t = await mk(a, { ...TIMED, description: 'รายละเอียด', urgency: 4, importance: 3 });
    const e = ev(t.id);
    expect(e.summary).toBe('ส่งรายงาน');
    expect(e.start).toEqual({ dateTime: '2026-11-05T14:00:00+07:00', timeZone: 'Asia/Bangkok' });
    expect(e.end).toEqual({ dateTime: '2026-11-05T15:00:00+07:00', timeZone: 'Asia/Bangkok' });
    expect(String(e.description)).toContain('รายละเอียด');
    expect(String(e.description)).toContain(`http://localhost:5173/?task=${t.id}`);
    // พรุ่งนี้ = ด่วน (คำนวณจากวันที่ ไม่ใช่ urgency ที่ตั้ง)
    expect(String(e.description)).toContain('ความเร่งด่วน: ด่วน');
    expect(e.reminders).toEqual({
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 30 }],
    });
    expect((await get(a, t.id)).gcalEventId).toBe(e.id);
    expect((await get(a, t.id)).gcalSyncedAt).toBeTruthy();
  });
  it('ไม่มีเวลาจบ: ใช้เวลาโดยประมาณ (90 นาที)', async () => {
    const t = await mk(a, { title: 'x', startAt: '2026-11-05T07:00:00Z', estimateMinutes: 90 });
    expect((ev(t.id).end as { dateTime: string }).dateTime).toBe('2026-11-05T15:30:00+07:00');
  });
  it('งานทั้งวัน: date และ end เป็น exclusive (วันถัดไป) รวมข้ามเดือน', async () => {
    const t1 = await mk(a, { title: 'ทั้งวัน', allDay: true, dueDate: '2026-11-06' });
    expect(ev(t1.id).start).toEqual({ date: '2026-11-06' });
    expect(ev(t1.id).end).toEqual({ date: '2026-11-07' });
    expect(ev(t1.id).reminders).toEqual({ useDefault: true });
    const t2 = await mk(a, { title: 'สิ้นเดือน', allDay: true, dueDate: '2026-11-30' });
    expect(ev(t2.id).end).toEqual({ date: '2026-12-01' });
  });
  it('มีแต่เดดไลน์: บล็อก ⏰ 30 นาทีที่จบตรงเวลา', async () => {
    const t = await mk(a, { title: 'ส่งใบเสนอราคา', dueAt: '2026-11-05T10:00:00Z' });
    const e = ev(t.id);
    expect(e.summary).toBe('⏰ ส่งใบเสนอราคา');
    expect(e.start).toMatchObject({ dateTime: '2026-11-05T16:30:00+07:00' });
    expect(e.end).toMatchObject({ dateTime: '2026-11-05T17:00:00+07:00' });
  });
  it('แก้ไขชื่อ/เวลา → PATCH ไม่สร้างซ้ำ', async () => {
    const t = await mk(a);
    await a.call('PATCH', `/api/tasks/${t.id}`, {
      title: 'ชื่อใหม่',
      startAt: '2026-11-06T02:00:00Z',
      endAt: '2026-11-06T03:30:00Z',
    });
    expect(g.all).toHaveLength(1);
    expect(g.count('POST')).toBe(1);
    expect(g.count('PATCH')).toBe(1);
    expect(ev(t.id).summary).toBe('ชื่อใหม่');
    expect(ev(t.id).start).toMatchObject({ dateTime: '2026-11-06T09:00:00+07:00' });
  });
  it('เปลี่ยนจากงานมีเวลาเป็นทั้งวัน ไม่ทิ้ง dateTime เก่า', async () => {
    const t = await mk(a);
    await a.call('PATCH', `/api/tasks/${t.id}`, { allDay: true, dueDate: '2026-11-08' });
    const e = ev(t.id);
    expect(e.start).toEqual({ date: '2026-11-08' });
    expect(e.end).toEqual({ date: '2026-11-09' });
  });
  it('ทำเสร็จ → ✅ นำหน้า, เปิดงานกลับ → เอาออก', async () => {
    const t = await mk(a);
    await a.call('POST', `/api/tasks/${t.id}/complete`);
    expect(ev(t.id).summary).toBe('✅ ส่งรายงาน');
    await a.call('PATCH', `/api/tasks/${t.id}`, { status: 'todo' });
    expect(ev(t.id).summary).toBe('ส่งรายงาน');
  });
  it('ยกเลิกงาน → ลบ event; กลับเป็นต้องทำ → สร้างใหม่', async () => {
    const t = await mk(a);
    await a.call('PATCH', `/api/tasks/${t.id}`, { status: 'cancelled' });
    expect(g.all).toHaveLength(0);
    expect((await get(a, t.id)).gcalEventId).toBeNull();
    await a.call('PATCH', `/api/tasks/${t.id}`, { status: 'todo' });
    expect(g.all).toHaveLength(1);
  });
  it('ลบงาน → ลบ event', async () => {
    const t = await mk(a);
    expect((await a.call('DELETE', `/api/tasks/${t.id}`)).status).toBe(200);
    expect(g.all).toHaveLength(0);
  });
  it('เลื่อน (snooze) → อัปเดต event', async () => {
    const t = await mk(a);
    await a.call('POST', `/api/tasks/${t.id}/snooze`, { minutes: 60 });
    expect(ev(t.id).start).toMatchObject({ dateTime: '2026-11-05T15:00:00+07:00' });
  });
  it('งานไม่มีวัน (Inbox) ไม่ซิงก์ จนกว่าจะกำหนดวัน และเอาวันออก = ลบ event', async () => {
    const t = await mk(a, { title: 'ไอเดีย' });
    expect(g.calls).toHaveLength(0);
    await a.call('PATCH', `/api/tasks/${t.id}`, { allDay: true, dueDate: '2026-11-07' });
    expect(g.all).toHaveLength(1);
    await a.call('PATCH', `/api/tasks/${t.id}`, { allDay: false, dueDate: null });
    expect(g.all).toHaveLength(0);
  });
  it('สวิตช์ต่องาน (gcalSync): ปิด = ไม่ซิงก์, เปิดทีหลัง = สร้าง, ปิดอีก = ลบ', async () => {
    const t = await mk(a, { ...TIMED, gcalSync: false });
    expect(g.calls).toHaveLength(0);
    expect((await get(a, t.id)).gcalSync).toBe(false);
    await a.call('PATCH', `/api/tasks/${t.id}`, { gcalSync: true });
    expect(g.all).toHaveLength(1);
    await a.call('PATCH', `/api/tasks/${t.id}`, { gcalSync: false });
    expect(g.all).toHaveLength(0);
  });
  it('งานทำซ้ำ → RRULE (UNTIL ของงานมีเวลาเป็น UTC)', async () => {
    const t = await mk(a, { ...TIMED, recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231' });
    expect(ev(t.id).recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T165959Z']);
    const t2 = await mk(a, {
      title: 'ทั้งวัน',
      allDay: true,
      dueDate: '2026-11-06',
      recurrenceRule: 'FREQ=DAILY;UNTIL=20261231',
    });
    expect(ev(t2.id).recurrence).toEqual(['RRULE:FREQ=DAILY;UNTIL=20261231']);
    expect(
      (await a.call('POST', '/api/tasks', { ...TIMED, recurrenceRule: 'FREQ=HOURLY' })).status,
    ).toBe(400);
  });
  it('ใส่ชื่อประเภทใน description', async () => {
    const cat = (await a.call('GET', '/api/categories')).json.categories[0];
    const t = await mk(a, { ...TIMED, categoryId: cat.id });
    expect(String(ev(t.id).description)).toContain(`#${cat.name}`);
  });
  it('ปิดซิงก์ใน settings → งานใหม่ไม่เรียก Google; เปิดไม่ได้ถ้าไม่ได้เชื่อม', async () => {
    await a.call('PATCH', '/api/gcal/settings', { syncEnabled: false });
    const before = g.calls.length;
    await mk(a);
    expect(g.calls.length).toBe(before);
    expect((await b.call('PATCH', '/api/gcal/settings', { syncEnabled: true })).status).toBe(400);
  });
  it('เลือกปฏิทิน (calendarId) และตรวจรูปแบบ', async () => {
    const id = 'work@group.calendar.google.com';
    expect((await a.call('PATCH', '/api/gcal/settings', { calendarId: id })).json.calendarId).toBe(
      id,
    );
    await mk(a);
    expect(g.calls.at(-1)!.path).toContain(encodeURIComponent(id));
    expect(
      (await a.call('PATCH', '/api/gcal/settings', { calendarId: '../evil/../x' })).status,
    ).toBe(400);
    expect((await a.call('PATCH', '/api/gcal/settings', { calendarId: 'a b' })).status).toBe(400);
  });
});

describe('ความทนทาน', () => {
  beforeEach(async () => {
    await connect(a);
  });
  const status = async () => (await a.call('GET', '/api/gcal/status')).json;

  it('401 จาก Google → refresh token อัตโนมัติ แล้วลองใหม่สำเร็จ', async () => {
    const t = await mk(a);
    g.expireAccessTokens();
    const before = g.refreshCount;
    expect((await a.call('PATCH', `/api/tasks/${t.id}`, { title: 'หลัง refresh' })).status).toBe(
      200,
    );
    expect(ev(t.id).summary).toBe('หลัง refresh');
    expect(g.refreshCount).toBe(before + 1);
    expect(g.calls.at(-1)!.auth).toBe(`Bearer at-${g.refreshCount}`);
    const [row] = await dbRows('select * from google_tokens');
    const uid = ((await dbRows("select id from users where email='a@x.com'"))[0] as { id: string })
      .id;
    expect(await decryptSecret(String(row!.access_token_enc), env.TOKEN_ENC_KEY, uid)).toBe(
      `at-${g.refreshCount}`,
    );
  });
  it('access token หมดอายุตามเวลา → refresh ก่อนเรียก (ไม่ต้องรอ 401)', async () => {
    const t = await mk(a);
    freezeNow(new Date(NOW.getTime() + 2 * 3600_000));
    g.expireAccessTokens();
    await a.call('PATCH', `/api/tasks/${t.id}`, { title: 'x' });
    expect(g.calls.filter((c) => c.auth === 'Bearer at-1').length).toBe(1); // มีแค่ตอนสร้างครั้งแรก
    expect(ev(t.id).summary).toBe('x');
  });
  it('invalid_grant (เพิกถอนสิทธิ์) → งานยังบันทึกได้ สถานะ "ต้องเชื่อมใหม่" และไม่เรียก Google อีก', async () => {
    const t = await mk(a);
    g.expireAccessTokens();
    g.refreshMode = 'invalid_grant';
    expect((await a.call('PATCH', `/api/tasks/${t.id}`, { title: 'ยังแก้ได้' })).status).toBe(200);
    expect((await get(a, t.id)).title).toBe('ยังแก้ได้');
    expect(await status()).toMatchObject({ connected: false, needsReconnect: true });
    const calls = g.calls.length;
    await mk(a);
    expect(g.calls.length).toBe(calls);
    const [row] = await dbRows('select * from google_tokens');
    expect(row!.refresh_token_enc).toBeNull();
    // เชื่อมใหม่ได้ และ resync ซ่อมให้
    g.refreshMode = 'ok';
    await connect(a);
    expect(await status()).toMatchObject({ connected: true, needsReconnect: false });
  });
  it('Google refresh ล่มชั่วคราว (503) → งานบันทึกได้ และยังถือว่าเชื่อมอยู่', async () => {
    const t = await mk(a);
    g.expireAccessTokens();
    g.refreshMode = 'down';
    expect((await a.call('PATCH', `/api/tasks/${t.id}`, { title: 'x' })).status).toBe(200);
    expect(await status()).toMatchObject({ connected: true, needsReconnect: false });
  });
  it('event ถูกลบฝั่ง Google (404/410) ตอนแก้ → สร้างใหม่', async () => {
    const t = await mk(a);
    const old = ev(t.id).id;
    g.events.clear();
    await a.call('PATCH', `/api/tasks/${t.id}`, { title: 'สร้างใหม่' });
    expect(g.all).toHaveLength(1);
    expect(ev(t.id).id).not.toBe(old);
    expect((await get(a, t.id)).gcalEventId).toBe(ev(t.id).id);
    g.events.clear();
    g.failNext.push({ status: 410 });
    await a.call('PATCH', `/api/tasks/${t.id}`, { title: 'อีกรอบ' });
    expect(g.all).toHaveLength(1);
  });
  it('ลบงานที่ event หายไปแล้ว ไม่ error', async () => {
    const t = await mk(a);
    g.events.clear();
    expect((await a.call('DELETE', `/api/tasks/${t.id}`)).status).toBe(200);
  });
  it('Google 500 ตอนสร้าง → งานยังสร้างสำเร็จ (201) และ resync ซ่อมได้', async () => {
    g.failNext.push({ status: 500 });
    const r = await a.call('POST', '/api/tasks', TIMED);
    expect(r.status).toBe(201);
    expect(r.json.task.gcalEventId).toBeNull();
    expect(g.all).toHaveLength(0);
    const out = (await a.call('POST', '/api/gcal/resync', {})).json;
    expect(out).toMatchObject({ created: 1, failed: 0 });
    expect(g.all).toHaveLength(1);
  });
  it('Calendar API ยังไม่เปิด (403) → resync รายงานสาเหตุ ไม่ throw', async () => {
    await mk(a, { title: 'ไม่ซิงก์ตอนนี้', startAt: '2026-11-05T07:00:00Z', gcalSync: false });
    await a.call('PATCH', '/api/gcal/settings', { syncEnabled: true });
    const t = (await a.call('POST', '/api/tasks', TIMED)).json.task;
    g.events.clear();
    await a.call('PATCH', `/api/tasks/${t.id}`, { gcalSync: true });
    g.failNext.push({
      status: 403,
      body: { error: { code: 403, errors: [{ reason: 'accessNotConfigured' }] } },
    });
    const out = (await a.call('POST', '/api/gcal/resync', {})).json;
    expect(out.failed).toBeGreaterThanOrEqual(1);
    expect(out.reasons).toContain('accessNotConfigured');
  });
  it('ถอดรหัส token ไม่ได้ (เปลี่ยน TOKEN_ENC_KEY) → ต้องเชื่อมใหม่ ไม่ crash', async () => {
    env.TOKEN_ENC_KEY = Buffer.alloc(32, 3).toString('base64');
    const r = await a.call('POST', '/api/tasks', TIMED);
    expect(r.status).toBe(201);
    expect(await status()).toMatchObject({ connected: false, needsReconnect: true });
  });
  it('คัดลอก ciphertext ของ A ไปให้ B ใช้ไม่ได้ (ผูกกับ userId) และไม่ส่ง token ของ A ไป Google', async () => {
    const rowA = (await dbRows('select * from google_tokens'))[0]!;
    const uidB = ((await dbRows("select id from users where email='b@x.com'"))[0] as { id: string })
      .id;
    await env.DB.prepare(
      'insert into google_tokens (user_id, refresh_token_enc, access_token_enc, expires_at, scope, email) values (?,?,?,?,?,?)',
    )
      .bind(
        uidB,
        rowA.refresh_token_enc,
        rowA.access_token_enc,
        rowA.expires_at,
        rowA.scope,
        'a@x.com',
      )
      .run();
    await env.DB.prepare('update user_settings set gcal_sync_enabled=1 where user_id=?')
      .bind(uidB)
      .run();
    const calls = g.calls.length;
    expect((await b.call('POST', '/api/tasks', TIMED)).status).toBe(201);
    expect(g.calls.length).toBe(calls); // ไม่มีการเรียก Google ด้วย token ที่ถอดไม่ได้
    expect((await b.call('GET', '/api/gcal/status')).json.needsReconnect).toBe(true);
  });
});

describe('ซิงก์งานที่สร้างจาก LINE', () => {
  let line: LineHarness;
  beforeEach(async () => {
    vi.unstubAllGlobals();
    line = new LineHarness(env); // ต้องสร้างก่อน FakeGoogle (FakeGoogle ห่อ fetch เดิม)
    g = new FakeGoogle();
    await connect(a);
    const code = (await a.call('POST', '/api/line/link-code')).json.code as string;
    await line.say(LA, `ผูกบัญชี ${code}`);
  });
  const tasks = async () =>
    (await a.call('GET', '/api/tasks')).json.tasks as { id: string; title: string }[];

  it('"ส่งรายงาน พรุ่งนี้ 14:00 #งาน !ด่วน" ขึ้น Google Calendar ถูกวัน/เวลา/เขตเวลา', async () => {
    await line.say(LA, 'ส่งรายงาน พรุ่งนี้ 14:00 #งาน !ด่วน');
    const [t] = await tasks();
    const e = ev(t!.id);
    expect(e.summary).toBe('ส่งรายงาน');
    expect(e.start).toEqual({ dateTime: '2026-11-05T14:00:00+07:00', timeZone: 'Asia/Bangkok' });
    expect(e.end).toEqual({ dateTime: '2026-11-05T15:00:00+07:00', timeZone: 'Asia/Bangkok' });
    expect(String(e.description)).toContain('#งาน');
    expect(line.replies.length).toBeGreaterThan(1); // ตอบ LINE แล้ว
  });
  it('เสร็จ / เลื่อน / ลบ ผ่าน LINE สะท้อนไป Google', async () => {
    await line.say(LA, 'ส่งรายงาน พรุ่งนี้ 14:00');
    const [t] = await tasks();
    await line.say(LA, 'เลื่อน ส่งรายงาน ศุกร์');
    expect(ev(t!.id).start).toMatchObject({ dateTime: '2026-11-06T14:00:00+07:00' });
    await line.say(LA, 'เสร็จ ส่งรายงาน');
    expect(ev(t!.id).summary).toBe('✅ ส่งรายงาน');
    await line.postback(LA, `a=del&id=${t!.id}`);
    await line.postback(LA, `a=delok&id=${t!.id}`);
    expect(g.all).toHaveLength(0);
  });
  it('postback เลื่อน 1 ชม. และกำหนดวันให้งานใน Inbox', async () => {
    await line.say(LA, 'ซื้อของ');
    expect(g.all).toHaveLength(0);
    const [t] = await tasks();
    await line.postback(LA, `a=sched&id=${t!.id}&w=tomorrow`);
    expect(ev(t!.id).start).toEqual({ date: '2026-11-05' });
    await line.say(LA, 'ประชุม พรุ่งนี้ 10:00');
    const m = (await tasks()).find((x) => x.title === 'ประชุม')!;
    await line.postback(LA, `a=snz&id=${m.id}&m=60`);
    expect(ev(m.id).start).toMatchObject({ dateTime: '2026-11-05T11:00:00+07:00' });
  });
  it('Google ล่ม → LINE ยังตอบและสร้างงานได้ตามปกติ', async () => {
    g.failNext.push({ status: 500 });
    await line.say(LA, 'ส่งรายงาน พรุ่งนี้ 14:00');
    expect(await tasks()).toHaveLength(1);
    expect(JSON.stringify(line.replies.at(-1))).toContain('บันทึกงานแล้ว');
  });
  it('ไม่ได้เชื่อม Google / ปิดซิงก์ → ใช้ LINE ได้ปกติ ไม่เรียก Google', async () => {
    await a.call('PATCH', '/api/gcal/settings', { syncEnabled: false });
    const calls = g.calls.length;
    await line.say(LA, 'ส่งรายงาน พรุ่งนี้ 14:00');
    expect(await tasks()).toHaveLength(1);
    expect(g.calls.length).toBe(calls);
  });
});

describe('Sync ทั้งหมดใหม่', () => {
  beforeEach(async () => {
    await connect(a);
    // สร้างงานตอนปิดซิงก์ เพื่อให้ยังไม่มี event
    await a.call('PATCH', '/api/gcal/settings', { syncEnabled: false });
    for (let i = 0; i < 25; i++) {
      await mk(a, {
        title: `งาน ${i}`,
        startAt: `2026-11-${String(5 + (i % 20)).padStart(2, '0')}T03:00:00Z`,
      });
    }
    await mk(a, { title: 'inbox' });
    await a.call('PATCH', '/api/gcal/settings', { syncEnabled: true });
    g.calls.length = 0;
  });
  async function runAll() {
    let cursor: string | null = null;
    const total = { processed: 0, created: 0, updated: 0, deleted: 0, failed: 0, batches: 0 };
    do {
      const r: Record<string, any> = (await a.call('POST', '/api/gcal/resync', { cursor })).json; // eslint-disable-line @typescript-eslint/no-explicit-any
      total.batches++;
      for (const k of ['processed', 'created', 'updated', 'deleted', 'failed'] as const)
        total[k] += r[k];
      cursor = r.nextCursor;
    } while (cursor);
    return total;
  }
  it('แบ่งเป็นชุดละ ≤ 10 งาน (เพดาน subrequest ของ Worker ฟรี) และสร้างครบ ไม่รวม Inbox', async () => {
    const r = await runAll();
    expect(r).toMatchObject({ processed: 25, created: 25, failed: 0 });
    expect(r.batches).toBe(3);
    expect(g.all).toHaveLength(25);
    // ต่อชุด: เรียก Google ไม่เกิน 10 ครั้ง
    expect(g.calls.length).toBe(25);
  });
  it('รันซ้ำไม่สร้างซ้ำ (idempotent): อัปเดตของเดิม', async () => {
    await runAll();
    const r = await runAll();
    expect(r).toMatchObject({ created: 0, updated: 25, failed: 0 });
    expect(g.all).toHaveLength(25);
  });
  it('event ที่ถูกลบใน Google ถูกสร้างใหม่; งานที่ปิดซิงก์แล้วถูกลบ event', async () => {
    await runAll();
    // งานใน Inbox ไม่มี event จึงกรองออก
    const synced = (
      (await a.call('GET', '/api/tasks')).json.tasks as { id: string; gcalEventId: string | null }[]
    ).filter((t) => t.gcalEventId) as { id: string; gcalEventId: string }[];
    const [victim, off] = synced;
    g.events.delete(victim!.gcalEventId);
    await a.call('PATCH', '/api/gcal/settings', { syncEnabled: false });
    await a.call('PATCH', `/api/tasks/${off!.id}`, { gcalSync: false }); // ปิดซิงก์ตอน sync ปิดอยู่ → event ยังค้าง
    await a.call('PATCH', '/api/gcal/settings', { syncEnabled: true });
    const r = await runAll();
    expect(r.created).toBe(1);
    expect(r.deleted).toBe(1);
    expect(g.all).toHaveLength(24);
  });
  it('ไม่ได้เชื่อม/ปิดซิงก์ → 400; ต้องล็อกอิน', async () => {
    expect((await b.call('POST', '/api/gcal/resync', {})).json.error.code).toBe('sync_unavailable');
    await a.call('PATCH', '/api/gcal/settings', { syncEnabled: false });
    expect((await a.call('POST', '/api/gcal/resync', {})).status).toBe(400);
    expect((await new Client(env).call('POST', '/api/gcal/resync', {})).status).toBe(401);
  });
});

describe('ยกเลิกการเชื่อม', () => {
  it('ลบ token เพิกถอนที่ Google ปิดซิงก์ และใช้งานงานต่อได้โดยไม่ error', async () => {
    await connect(a);
    const t = await mk(a);
    const r = await a.call('POST', '/api/gcal/disconnect');
    expect(r.json).toMatchObject({ connected: false, syncEnabled: false });
    expect(g.revoked).toEqual(['rt-secret-value']);
    expect(await dbRows('select * from google_tokens')).toHaveLength(0);
    const calls = g.calls.length;
    expect((await a.call('PATCH', `/api/tasks/${t.id}`, { title: 'หลังถอด' })).status).toBe(200);
    expect((await mk(a)).id).toBeTruthy();
    expect((await a.call('DELETE', `/api/tasks/${t.id}`)).status).toBe(200);
    expect(g.calls.length).toBe(calls);
    expect(g.all).toHaveLength(1); // event เดิมยังอยู่ใน Google (ไม่ลบย้อนหลัง)
  });
  it('ยกเลิกตอนยังไม่ได้เชื่อม ไม่ error; เชื่อมใหม่ได้', async () => {
    expect((await a.call('POST', '/api/gcal/disconnect')).status).toBe(200);
    await connect(a);
    expect((await a.call('GET', '/api/gcal/status')).json.connected).toBe(true);
  });
  it('ถ้าเพิกถอนที่ Google ไม่สำเร็จ ก็ยังลบฝั่งเรา', async () => {
    await connect(a);
    g.revoked.length = 0;
    const real = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string, i?: RequestInit) => {
        if (String(u).includes('/revoke')) throw new Error('network');
        return real(u, i);
      }),
    );
    expect((await a.call('POST', '/api/gcal/disconnect')).json.connected).toBe(false);
  });
});

describe('สิทธิ์ข้ามผู้ใช้', () => {
  it('B ไม่เห็นสถานะ/token ของ A; ทุก endpoint ต้องล็อกอิน; มี CSRF check', async () => {
    await connect(a);
    const stB = (await b.call('GET', '/api/gcal/status')).json;
    expect(stB).toMatchObject({ connected: false, email: null });
    for (const [m, p] of [
      ['GET', '/api/gcal/status'],
      ['PATCH', '/api/gcal/settings'],
      ['POST', '/api/gcal/disconnect'],
      ['POST', '/api/gcal/resync'],
    ] as const) {
      expect(
        (await new Client(env).call(m, p, m === 'GET' ? undefined : {})).status,
        `${m} ${p}`,
      ).toBe(401);
    }
    expect(
      (await a.call('POST', '/api/gcal/disconnect', {}, { Origin: 'https://evil.example' })).status,
    ).toBe(403);
    expect((await a.call('GET', '/api/gcal/status')).json.connected).toBe(true);
    const all = JSON.stringify([
      (await a.call('GET', '/api/gcal/status')).json,
      (await a.call('GET', '/api/tasks')).json,
    ]);
    expect(all).not.toContain('rt-secret');
    expect(all).not.toContain('refresh');
  });
  it('B ทำงาน/ซิงก์ของตัวเองไม่กระทบ event ของ A', async () => {
    await connect(a);
    const t = await mk(a);
    await mk(b);
    expect(g.all).toHaveLength(1);
    expect((await b.call('DELETE', `/api/tasks/${t.id}`)).status).toBe(404);
    expect(g.all).toHaveLength(1);
  });
});

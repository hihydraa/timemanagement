import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';
import { freezeNow } from '../src/lib/time';
import { b64uEncode, generateVapidKeys } from '../src/lib/webpush';
import { runAlarms } from '../src/services/alarms';
import { Client, makeEnv } from './helpers/app';

const DAY = '2026-11-04'; // พุธ
const at = (hm: string, date = DAY) => freezeNow(new Date(`${date}T${hm}:00+07:00`));

let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;
let pushed: { url: string; headers: Record<string, string> }[];

async function device(c: Client, name: string) {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  await c.call('POST', '/api/push/subscribe', {
    endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
    keys: { p256dh: b64uEncode(pub), auth: b64uEncode(crypto.getRandomValues(new Uint8Array(16))) },
  });
}
const mkAlarm = async (c: Client, body: object) =>
  (await c.call('POST', '/api/alarms', body)).json.alarm as { id: string };
const run = () => runAlarms(env);
const row = async (id: string) =>
  (await env.DB.prepare('select * from alarms where id=?').bind(id).all()).results[0] as Record<
    string,
    unknown
  >;

beforeEach(async () => {
  at('05:00');
  const k = await generateVapidKeys();
  env = makeEnv({ VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey });
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
  await device(a, 'a1');
  await device(b, 'b1');
  pushed = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    pushed.push({ url, headers: init.headers as Record<string, string> });
    return new Response(null, { status: 201 });
  });
});
afterEach(() => {
  freezeNow(null);
  vi.unstubAllGlobals();
});

describe('API นาฬิกาปลุก', () => {
  it('สร้าง/แก้/ลบ และแต่ละบัญชีเห็นเฉพาะของตัวเอง', async () => {
    const x = await mkAlarm(a, { time: '06:30', label: 'ตื่น', days: [1, 2, 3, 4, 5] });
    expect((await a.call('GET', '/api/alarms')).json.alarms).toMatchObject([
      {
        id: x.id,
        time: '06:30',
        label: 'ตื่น',
        days: [1, 2, 3, 4, 5],
        enabled: true,
        onceDate: null,
      },
    ]);
    expect((await b.call('GET', '/api/alarms')).json.alarms).toEqual([]);
    expect((await b.call('PATCH', `/api/alarms/${x.id}`, { label: 'x' })).status).toBe(404);
    expect((await b.call('DELETE', `/api/alarms/${x.id}`)).status).toBe(404);
    expect((await b.call('POST', `/api/alarms/${x.id}/stop`)).status).toBe(404);
    expect((await b.call('GET', `/api/alarms/${x.id}/ics`)).status).toBe(404);
    expect(
      (await a.call('PATCH', `/api/alarms/${x.id}`, { time: '07:00', enabled: false })).json.alarm,
    ).toMatchObject({ time: '07:00', enabled: false });
    expect((await a.call('DELETE', `/api/alarms/${x.id}`)).status).toBe(200);
    expect((await a.call('GET', '/api/alarms')).json.alarms).toEqual([]);
  });
  it('ตรวจอินพุต + เพดาน 20 ตัว + ต้อง login', async () => {
    expect((await a.call('POST', '/api/alarms', { time: '6:30' })).status).toBe(400);
    expect((await a.call('POST', '/api/alarms', { time: '25:00' })).status).toBe(400);
    expect((await a.call('POST', '/api/alarms', { time: '06:30', days: [0] })).status).toBe(400);
    expect((await a.call('POST', '/api/alarms', { time: '06:30', userId: 'b' })).status).toBe(400);
    expect((await new Client(env).call('GET', '/api/alarms')).status).toBe(401);
    for (let i = 0; i < 20; i++) await mkAlarm(a, { time: '06:30' });
    expect((await a.call('POST', '/api/alarms', { time: '06:30' })).status).toBe(409);
  });
  it('ครั้งเดียว: ถ้าเวลาผ่านไปแล้ววันนี้ → พรุ่งนี้, ยังไม่ถึง → วันนี้', async () => {
    at('08:00');
    expect((await a.call('POST', '/api/alarms', { time: '07:00' })).json.alarm.onceDate).toBe(
      '2026-11-05',
    );
    expect((await a.call('POST', '/api/alarms', { time: '09:00' })).json.alarm.onceDate).toBe(DAY);
  });
  it('ICS: มี VALARM, เขตเวลา, RRULE ตามวันที่เลือก', async () => {
    const x = await mkAlarm(a, { time: '06:30', label: 'ตื่น', days: [1, 3] });
    const r = await app.request(
      `http://localhost:8787/api/alarms/${x.id}/ics`,
      { headers: { Cookie: a.cookie } },
      env,
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/calendar');
    const t = await r.text();
    expect(t).toContain('BEGIN:VALARM');
    expect(t).toContain('TRIGGER:PT0S');
    expect(t).toContain('DTSTART;TZID=Asia/Bangkok:20261104T063000');
    expect(t).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE');
    expect(t).toMatch(/^BEGIN:VCALENDAR\r\n/);
  });
});

describe('cron นาฬิกาปลุก', () => {
  it('ดังตรงนาที ครั้งเดียวต่อวัน; ส่งแบบ urgency high; ไม่ดังผิดเวลา/ผิดวัน', async () => {
    const x = await mkAlarm(a, { time: '06:30', days: [3] }); // พุธ
    await mkAlarm(a, { time: '06:30', days: [1] }); // จันทร์ (ไม่ใช่วันนี้)
    at('06:29');
    await run();
    expect(pushed).toHaveLength(0);
    at('06:30');
    const r = await run();
    expect(r).toMatchObject({ fired: 1, repeated: 0, sent: 1 });
    expect(pushed[0]!.headers.Urgency).toBe('high');
    expect(pushed[0]!.headers.TTL).toBe('120');
    expect(await row(x.id)).toMatchObject({ ring_count: 1, last_fired_date: DAY });
    // ในนาทีเดียวกันรันซ้ำ ไม่ดังเพิ่ม (ยังไม่ถึงเวลาดังซ้ำ)
    await run();
    expect(pushed).toHaveLength(1);
  });
  it('ดังซ้ำทุก 1 นาที รวม 4 ครั้ง แล้วเงียบ', async () => {
    const x = await mkAlarm(a, { time: '06:30', days: [3] });
    for (const m of ['06:30', '06:31', '06:32', '06:33']) {
      at(m);
      await run();
    }
    expect(pushed).toHaveLength(4);
    at('06:34');
    await run();
    expect(pushed).toHaveLength(4);
    expect(await row(x.id)).toMatchObject({ ring_count: 0, next_ring_at: null, enabled: 1 });
    at('06:30', '2026-11-11'); // อาทิตย์ถัดไป (พุธ) ดังใหม่ได้
    await run();
    expect(pushed).toHaveLength(5);
  });
  it('กดหยุด = เงียบทันที; ครั้งเดียวจะปิดนาฬิกา', async () => {
    const x = await mkAlarm(a, { time: '06:30', days: [3] });
    const once = await mkAlarm(a, { time: '06:30' });
    at('06:30');
    await run();
    expect(pushed).toHaveLength(2);
    await a.call('POST', `/api/alarms/${x.id}/stop`);
    await a.call('POST', `/api/alarms/${once.id}/stop`);
    at('06:31');
    await run();
    expect(pushed).toHaveLength(2);
    expect(await row(x.id)).toMatchObject({ ring_count: 0, enabled: 1 });
    expect(await row(once.id)).toMatchObject({ ring_count: 0, enabled: 0 });
  });
  it('เลื่อน 5 นาที: ดังอีกครั้งตอน +5 และไม่ดังก่อน', async () => {
    const x = await mkAlarm(a, { time: '06:30', days: [3] });
    at('06:30');
    await run();
    at('06:31');
    await a.call('POST', `/api/alarms/${x.id}/snooze`);
    pushed.length = 0;
    for (const m of ['06:32', '06:35']) {
      at(m);
      await run();
    }
    expect(pushed).toHaveLength(0);
    at('06:36');
    await run();
    expect(pushed).toHaveLength(1);
  });
  it('ปิดนาฬิกา (enabled=false) ไม่ดัง; ครั้งเดียวดังแค่วันที่กำหนด', async () => {
    const off = await mkAlarm(a, { time: '06:30', days: [3], enabled: false });
    const once = await mkAlarm(a, { time: '06:30' }); // 05:00 → วันนี้
    void off;
    at('06:30', '2026-11-03');
    await run();
    expect(pushed).toHaveLength(0);
    at('06:30');
    await run();
    expect(pushed).toHaveLength(1);
    void once;
  });
  it('ส่งเฉพาะอุปกรณ์ของเจ้าของ; ไม่มีอุปกรณ์ = ไม่ส่งแต่ไม่พัง; ไม่ตั้ง VAPID = ไม่ทำอะไร', async () => {
    await mkAlarm(b, { time: '06:30', days: [3] });
    at('06:30');
    await run();
    expect(pushed.map((p) => p.url)).toEqual(['https://fcm.googleapis.com/fcm/send/b1']);
    await a.call('DELETE', '/api/push/subscribe', {
      endpoint: 'https://fcm.googleapis.com/fcm/send/a1',
    });
    await mkAlarm(a, { time: '06:31', days: [3] });
    at('06:31');
    pushed.length = 0;
    const r = await run();
    expect(r.fired).toBe(1);
    expect(pushed.map((p) => p.url)).not.toContain('https://fcm.googleapis.com/fcm/send/a1'); // A ไม่มีอุปกรณ์แล้ว
    expect(await runAlarms(makeEnv())).toEqual({ fired: 0, repeated: 0, sent: 0 });
  });
  it('ไม่ผูกกับ quiet hours (ผู้ใช้ตั้งเอง)', async () => {
    await a.call('PATCH', '/api/settings', { quietHoursStart: '22:00', quietHoursEnd: '08:00' });
    await mkAlarm(a, { time: '06:30', days: [3] });
    at('06:30');
    await run();
    expect(pushed).toHaveLength(1);
  });
  it('ลบบัญชีลบนาฬิกาปลุกด้วย', async () => {
    await mkAlarm(a, { time: '06:30' });
    await a.call('DELETE', '/api/account', { confirm: 'a@x.com' });
    const n = (await env.DB.prepare('select count(*) n from alarms').first()) as { n: number };
    expect(Number(n.n)).toBe(0);
  });
});

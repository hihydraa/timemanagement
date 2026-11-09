import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freezeNow } from '../src/lib/time';
import { b64uEncode, generateVapidKeys } from '../src/lib/webpush';
import { runWebNotifications } from '../src/services/webNotifications';
import { Client, makeEnv } from './helpers/app';

const DAY = '2026-11-04'; // พุธ
const at = (hm: string, date = DAY) => freezeNow(new Date(`${date}T${hm}:00+07:00`));
const iso = (hm: string, date = DAY) => new Date(`${date}T${hm}:00+07:00`).toISOString();

let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;
let pushed: { url: string; status: number }[];
let respond = 201;

async function device(c: Client, name = 'x') {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  const endpoint = `https://fcm.googleapis.com/fcm/send/${name}`;
  const r = await c.call('POST', '/api/push/subscribe', {
    endpoint,
    keys: { p256dh: b64uEncode(pub), auth: b64uEncode(crypto.getRandomValues(new Uint8Array(16))) },
  });
  return { endpoint, r };
}
const mk = (c: Client, body: object) => c.call('POST', '/api/tasks', body);
const cron = () => runWebNotifications(env);
const rows = async (sql: string) =>
  (await env.DB.prepare(sql).all()).results as Record<string, unknown>[];

beforeEach(async () => {
  at('05:00');
  const k = await generateVapidKeys();
  env = makeEnv({ VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey });
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
  pushed = [];
  respond = 201;
  vi.stubGlobal('fetch', async (url: string) => {
    pushed.push({ url, status: respond });
    return new Response(null, { status: respond });
  });
});
afterEach(() => {
  freezeNow(null);
  vi.unstubAllGlobals();
});

describe('API สมัครรับแจ้งเตือนในเว็บ', () => {
  it('config: ตั้ง VAPID แล้ว configured=true + publicKey; ไม่ตั้ง = false', async () => {
    const r = (await a.call('GET', '/api/push/config')).json;
    expect(r).toMatchObject({ configured: true, devices: 0 });
    expect(r.publicKey).toBeTruthy();
    const e2 = makeEnv();
    const c = new Client(e2);
    await c.login('a@x.com');
    expect((await c.call('GET', '/api/push/config')).json).toMatchObject({
      configured: false,
      publicKey: null,
    });
    expect((await device(c)).r.status).toBe(400);
  });
  it('สมัคร/ซ้ำ/ยกเลิก และแต่ละบัญชีเห็นเฉพาะอุปกรณ์ตัวเอง', async () => {
    expect((await device(a, 'd1')).r.status).toBe(200);
    expect((await device(a, 'd1')).r.status).toBe(200); // ซ้ำ = ไม่เพิ่ม
    expect((await a.call('GET', '/api/push/config')).json.devices).toBe(1);
    expect((await b.call('GET', '/api/push/config')).json.devices).toBe(0);
    await b.call('DELETE', '/api/push/subscribe', {
      endpoint: 'https://fcm.googleapis.com/fcm/send/d1',
    }); // B ลบของ A ไม่ได้
    expect((await a.call('GET', '/api/push/config')).json.devices).toBe(1);
    await a.call('DELETE', '/api/push/subscribe', {
      endpoint: 'https://fcm.googleapis.com/fcm/send/d1',
    });
    expect((await a.call('GET', '/api/push/config')).json.devices).toBe(0);
  });
  it('ปฏิเสธ endpoint นอกรายการ (กัน SSRF) / กุญแจผิด / ฟิลด์แปลก', async () => {
    const ok = {
      p256dh: b64uEncode(new Uint8Array([4, ...new Uint8Array(64)])),
      auth: b64uEncode(new Uint8Array(16)),
    };
    expect(
      (
        await a.call('POST', '/api/push/subscribe', {
          endpoint: 'https://evil.example.com/x',
          keys: ok,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await a.call('POST', '/api/push/subscribe', {
          endpoint: 'https://fcm.googleapis.com/x',
          keys: { ...ok, auth: 'AA' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await a.call('POST', '/api/push/subscribe', {
          endpoint: 'https://fcm.googleapis.com/x',
          keys: ok,
          userId: 'b',
        })
      ).status,
    ).toBe(400);
    expect((await new Client(env).call('POST', '/api/push/subscribe', {})).status).toBe(401);
  });
  it('จำกัด 5 อุปกรณ์ต่อบัญชี (ลบอันเก่าสุด)', async () => {
    for (let i = 0; i < 7; i++) {
      at('05:00', `2026-11-0${i + 1}`);
      await device(a, `d${i}`);
    }
    expect((await a.call('GET', '/api/push/config')).json.devices).toBe(5);
  });
  it('ทดสอบส่ง: ส่งไปทุกอุปกรณ์ของตัวเองเท่านั้น', async () => {
    await device(a, 'a1');
    await device(a, 'a2');
    await device(b, 'b1');
    const r = await a.call('POST', '/api/push/test');
    expect(r.json).toEqual({ ok: 2, tried: 2 });
    expect(pushed.map((p) => p.url).sort()).toEqual([
      'https://fcm.googleapis.com/fcm/send/a1',
      'https://fcm.googleapis.com/fcm/send/a2',
    ]);
    expect((await new Client(env).call('POST', '/api/push/test')).status).toBe(401);
  });
  it('ทดสอบส่งเมื่อไม่มีอุปกรณ์ = 400', async () => {
    expect((await a.call('POST', '/api/push/test')).status).toBe(400);
  });
  it('subscription ที่ push service ตอบ 410 ถูกลบอัตโนมัติ', async () => {
    await device(a, 'gone');
    respond = 410;
    await a.call('POST', '/api/push/test');
    expect((await a.call('GET', '/api/push/config')).json.devices).toBe(0);
  });
});

describe('cron แจ้งเตือนในเว็บ', () => {
  beforeEach(async () => {
    await device(a, 'a1');
    pushed.length = 0;
  });
  it('ไม่มีใครสมัคร/ไม่ตั้ง VAPID = ไม่ทำอะไร', async () => {
    const e2 = makeEnv();
    expect(await runWebNotifications(e2)).toEqual({ users: 0, sent: 0, failed: 0 });
  });
  it('สรุปเช้าวันละครั้ง ไม่ส่งซ้ำ และไม่ส่งถ้าไม่มีงาน', async () => {
    at('07:30');
    await cron();
    expect(pushed).toHaveLength(0); // ไม่มีงาน
    await mk(a, { title: 'ส่งรายงาน', allDay: true, dueDate: DAY });
    await cron();
    await cron();
    at('09:00');
    await cron();
    expect(pushed).toHaveLength(1);
    expect(await rows('select kind, channel, ok from notification_log')).toEqual([
      { kind: 'morning_digest', channel: 'web_push', ok: 1 },
    ]);
  });
  it('เคารพ quiet hours และไม่นับกับโควตา LINE (channel แยก)', async () => {
    await mk(a, { title: 'งาน', allDay: true, dueDate: DAY });
    await a.call('PATCH', '/api/settings', { quietHoursStart: '07:00', quietHoursEnd: '08:00' });
    at('07:30');
    await cron();
    expect(pushed).toHaveLength(0);
    at('08:00');
    await cron();
    expect(pushed).toHaveLength(1);
    expect((await a.call('GET', '/api/notifications/status')).json.used).toBe(0);
  });
  it('เตือนก่อนนัดที่กำหนดเวลา ครั้งเดียว; ไม่เตือนงานทั้งวัน/เดดไลน์ทั่วไป', async () => {
    await mk(a, { title: 'ประชุมลูกค้า', startAt: iso('14:20'), endAt: iso('15:00') });
    await mk(a, { title: 'เดดไลน์', dueAt: iso('14:25') });
    await mk(a, { title: 'ทั้งวัน', allDay: true, dueDate: DAY });
    at('13:40');
    await cron();
    expect(pushed).toHaveLength(0);
    at('13:55');
    await cron();
    await cron();
    expect(pushed).toHaveLength(1);
    expect(await rows('select kind from reminders')).toEqual([{ kind: 'web_before' }]);
  });
  it('สรุปเย็นปิดเป็นค่าเริ่มต้น เปิดแล้วจึงส่ง', async () => {
    await mk(a, { title: 'ค้าง', startAt: iso('21:00'), endAt: iso('22:00') });
    at('20:00');
    await cron();
    expect(pushed).toHaveLength(0);
    await a.call('PATCH', '/api/settings', { eveningReviewEnabled: true });
    await cron();
    expect(pushed).toHaveLength(1);
  });
  it('ผู้ใช้ที่ไม่ได้สมัครไม่ได้รับ และงานของคนอื่นไม่รั่ว', async () => {
    await mk(b, { title: 'งานของ B', allDay: true, dueDate: DAY });
    at('07:30');
    await cron();
    expect(pushed).toHaveLength(0);
  });
  it('ส่งไม่สำเร็จ: บันทึก ok=0 และลองใหม่ได้จำกัดต่อวัน', async () => {
    await mk(a, { title: 'งาน', allDay: true, dueDate: DAY });
    respond = 500;
    at('07:30');
    for (let i = 0; i < 6; i++) await cron();
    const l = await rows("select ok from notification_log where channel='web_push'");
    expect(l.length).toBe(3);
    expect(l.every((x) => x.ok === 0)).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freezeNow } from '../src/lib/time';
import { Client, makeEnv } from './helpers/app';

let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;
beforeEach(async () => {
  freezeNow(new Date('2026-11-12T10:00:00+07:00'));
  env = makeEnv();
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
});
afterEach(() => freezeNow(null));

const anon = () => new Client(env);
const tokenOf = (url: string) => /\/ics\/([a-f0-9]{48})\.ics$/.exec(url)![1]!;

describe('ลิงก์สมัครรับปฏิทิน (Apple Calendar)', () => {
  it('ต้องล็อกอินก่อนจัดการลิงก์', async () => {
    expect((await anon().call('GET', '/api/calendar-feed')).status).toBe(401);
    expect((await anon().call('POST', '/api/calendar-feed', {})).status).toBe(401);
  });

  it('ยังไม่เปิด → enabled=false; สร้างแล้วได้ https + webcal', async () => {
    expect((await a.call('GET', '/api/calendar-feed')).json).toEqual({
      enabled: false,
      url: null,
      webcalUrl: null,
    });
    const r = (await a.call('POST', '/api/calendar-feed', {})).json;
    expect(r.enabled).toBe(true);
    expect(r.url).toMatch(/^http:\/\/localhost:5173\/ics\/[a-f0-9]{48}\.ics$/);
    expect(r.webcalUrl).toBe(r.url.replace('http:', 'webcal:'));
  });

  it('ดึงปฏิทินด้วย token ได้โดยไม่ต้องล็อกอิน และมีเฉพาะงานของเจ้าของ', async () => {
    await a.call('POST', '/api/tasks', { title: 'งานของ A', allDay: true, dueDate: '2026-11-15' });
    await b.call('POST', '/api/tasks', { title: 'งานของ B', allDay: true, dueDate: '2026-11-15' });
    const { url } = (await a.call('POST', '/api/calendar-feed', {})).json;
    const res = await anon().raw('GET', new URL(url).pathname);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    const ics = await res.text();
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('งานของ A');
    expect(ics).not.toContain('งานของ B');
  });

  it('token ผิด/รูปแบบผิด → 404', async () => {
    expect((await anon().raw('GET', `/ics/${'0'.repeat(48)}.ics`)).status).toBe(404);
    expect((await anon().raw('GET', '/ics/abc.ics')).status).toBe(404);
    expect((await anon().raw('GET', `/ics/${'0'.repeat(48)}`)).status).toBe(404);
  });

  it('สร้างลิงก์ใหม่ → ลิงก์เก่าใช้ไม่ได้; ปิด → ใช้ไม่ได้', async () => {
    const first = (await a.call('POST', '/api/calendar-feed', {})).json.url as string;
    const second = (await a.call('POST', '/api/calendar-feed', {})).json.url as string;
    expect(tokenOf(second)).not.toBe(tokenOf(first));
    expect((await anon().raw('GET', new URL(first).pathname)).status).toBe(404);
    expect((await anon().raw('GET', new URL(second).pathname)).status).toBe(200);
    const off = (await a.call('DELETE', '/api/calendar-feed')).json;
    expect(off.enabled).toBe(false);
    expect((await anon().raw('GET', new URL(second).pathname)).status).toBe(404);
  });

  it('ผู้ใช้อื่นปิด/หมุนลิงก์ของเราไม่ได้ (token แยกตามบัญชี)', async () => {
    const mine = (await a.call('POST', '/api/calendar-feed', {})).json.url as string;
    await b.call('DELETE', '/api/calendar-feed');
    await b.call('POST', '/api/calendar-feed', {});
    expect((await anon().raw('GET', new URL(mine).pathname)).status).toBe(200);
  });
});

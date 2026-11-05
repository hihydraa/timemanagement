import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freezeNow } from '../src/lib/time';
import { sanitizeProps } from '../src/services/analytics';
import { Client, makeEnv } from './helpers/app';

let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;
beforeEach(async () => {
  freezeNow(new Date('2026-11-05T03:00:00Z'));
  env = makeEnv();
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
});
afterEach(() => freezeNow(null));

type Row = { name: string; props_json: string };
const events = async (email = 'a@x.com') =>
  (
    await env.DB.prepare(
      'select e.name, e.props_json from usage_events e join users u on u.id=e.user_id where u.email=? order by e.created_at, e.rowid',
    )
      .bind(email)
      .all()
  ).results as Row[];
const names = async (email?: string) => (await events(email)).map((e) => e.name);

describe('usage_events', () => {
  it('signup บันทึกครั้งเดียว', async () => {
    expect(await names()).toEqual(['signup']);
    await a.login('a@x.com'); // login ซ้ำ ไม่ใช่ signup ใหม่
    expect((await names()).filter((n) => n === 'signup')).toHaveLength(1);
  });

  it('task_created แยกช่องทาง และ first_task_created เกิดครั้งเดียว', async () => {
    await a.call('POST', '/api/tasks?src=quick', { title: 'ความลับของฉัน' });
    await a.call('POST', '/api/tasks', { title: 'อีกงาน' });
    const ev = await events();
    expect(ev.map((e) => e.name)).toEqual([
      'signup',
      'task_created',
      'first_task_created',
      'task_created',
    ]);
    expect(JSON.parse(ev[1]!.props_json)).toEqual({ source: 'web_quick' });
    expect(JSON.parse(ev[2]!.props_json)).toMatchObject({ seconds_since_signup: 0 });
    expect(JSON.parse(ev[3]!.props_json)).toEqual({ source: 'web_form' });
  });

  it('ไม่มีเนื้อหางาน/ข้อความอิสระในแถวใด ๆ', async () => {
    await a.call('POST', '/api/tasks?src=quick', {
      title: 'ความลับของฉัน',
      description: 'รายละเอียดลับ',
      tags: ['แท็กลับ'],
    });
    const all = (await events()).map((e) => e.name + e.props_json).join('|');
    expect(all).not.toMatch(/ความลับ|ลับ|แท็ก/);
  });

  it('task_completed บันทึกเฉพาะตอนเปลี่ยนเป็นเสร็จ (ไม่ซ้ำ)', async () => {
    const t = (await a.call('POST', '/api/tasks', { title: 'x' })).json.task.id;
    await a.call('POST', `/api/tasks/${t}/complete`);
    await a.call('POST', `/api/tasks/${t}/complete`);
    expect((await names()).filter((n) => n === 'task_completed')).toHaveLength(1);
  });

  it('morning_plan_opened วันละครั้ง, รับเฉพาะชื่อที่อนุญาต', async () => {
    expect((await a.call('POST', '/api/events', { name: 'morning_plan_opened' })).status).toBe(200);
    await a.call('POST', '/api/events', { name: 'morning_plan_opened' });
    expect((await names()).filter((n) => n === 'morning_plan_opened')).toHaveLength(1);
    expect((await a.call('POST', '/api/events', { name: 'task_completed' })).status).toBe(400);
    expect((await a.call('POST', '/api/events', { name: 'x', props: { a: 1 } })).status).toBe(400);
  });

  it('ui_mode_changed บันทึกเมื่อเปลี่ยนจริงเท่านั้น', async () => {
    await a.call('PATCH', '/api/settings', { uiMode: 'simple' }); // เท่าเดิม
    await a.call('PATCH', '/api/settings', { uiMode: 'full' });
    const ev = (await events()).filter((e) => e.name === 'ui_mode_changed');
    expect(ev).toHaveLength(1);
    expect(JSON.parse(ev[0]!.props_json)).toEqual({ to: 'full' });
  });

  it('opt-out: ลบของเดิมและไม่เก็บแถวใหม่; ผู้ใช้อื่นไม่กระทบ', async () => {
    await a.call('POST', '/api/tasks', { title: 'x' });
    expect((await events()).length).toBeGreaterThan(0);
    const r = await a.call('PATCH', '/api/settings', { analyticsOptOut: true });
    expect(r.json.analyticsOptOut).toBe(true);
    expect(await events()).toEqual([]);
    await a.call('POST', '/api/tasks', { title: 'y' });
    const t = (await a.call('POST', '/api/tasks', { title: 'z' })).json.task.id;
    await a.call('POST', `/api/tasks/${t}/complete`);
    expect(await events()).toEqual([]);
    expect((await names('b@x.com')).length).toBeGreaterThan(0);
    await a.call('PATCH', '/api/settings', { analyticsOptOut: false });
    await a.call('POST', '/api/tasks', { title: 'w' });
    expect((await names()).length).toBeGreaterThan(0);
  });

  it('ลบบัญชี = ลบ usage_events ด้วย', async () => {
    await a.call('POST', '/api/tasks', { title: 'x' });
    const r = await a.call('DELETE', '/api/account', { confirm: 'a@x.com' });
    expect(r.status).toBe(200);
    const n = (await env.DB.prepare('select count(*) n from usage_events').first()) as {
      n: number;
    };
    const mine = await names('b@x.com');
    expect(mine.length).toBeGreaterThan(0);
    expect(Number(n.n)).toBe(mine.length);
  });

  it('sanitizeProps ทิ้งข้อความอิสระ/คีย์แปลก', () => {
    expect(
      sanitizeProps({
        source: 'web_quick',
        seconds_since_signup: 12.6,
        ok: true,
        title: 'ส่งรายงาน ลูกค้า A',
        long: 'a'.repeat(40),
        'bad key': 1,
        obj: { a: 1 },
      }),
    ).toEqual({ source: 'web_quick', seconds_since_signup: 13, ok: true });
  });
});

describe('ui_mode / onboarding', () => {
  it('ผู้ใช้ใหม่ = simple, ยังไม่ผ่าน onboarding; ตั้งค่าได้และแยกตามบัญชี', async () => {
    const s = (await a.call('GET', '/api/settings')).json;
    expect(s.uiMode).toBe('simple');
    expect(s.onboardingDone).toBe(false);
    expect(s.analyticsOptOut).toBe(false);
    const r = await a.call('PATCH', '/api/settings', { uiMode: 'full', onboardingDone: true });
    expect(r.json.uiMode).toBe('full');
    expect(r.json.onboardingDone).toBe(true);
    expect((await b.call('GET', '/api/settings')).json.uiMode).toBe('simple');
    expect((await a.call('PATCH', '/api/settings', { uiMode: 'weird' })).status).toBe(400);
    expect(
      (await a.call('PATCH', '/api/settings', { onboardingDone: false })).json.onboardingDone,
    ).toBe(false);
  });
});

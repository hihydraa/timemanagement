import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { freezeNow } from '../src/lib/time';
import {
  inWindow,
  isQuietHours,
  notificationStatus,
  retryDelays,
  runNotifications,
} from '../src/services/notifications';
import { getDb } from '../src/db/client';
import { Client, makeEnv } from './helpers/app';
import { json, LineHarness } from './helpers/line';

const DAY = '2026-11-04'; // พุธ
const at = (hm: string, date = DAY) => freezeNow(new Date(`${date}T${hm}:00+07:00`));
const LA = 'U' + 'a'.repeat(32);
const LB = 'U' + 'b'.repeat(32);

let env: ReturnType<typeof makeEnv>;
let line: LineHarness;
let a: Client;
let b: Client;

async function link(c: Client, lineUserId: string) {
  const code = (await c.call('POST', '/api/line/link-code')).json.code as string;
  await line.say(lineUserId, `ผูกบัญชี ${code}`);
}
const mk = async (c: Client, body: object) =>
  (await c.call('POST', '/api/tasks', body)).json.task as { id: string };
const cron = () => runNotifications(env);
const setting = (c: Client, body: object) => c.call('PATCH', '/api/settings', body);
const rows = async (sql: string) =>
  (await env.DB.prepare(sql).all()).results as Record<string, unknown>[];
const logs = () => rows('select kind, ok, detail from notification_log order by sent_at, rowid');
const pushText = (i = 0) => json(line.pushes[i]?.messages);
const iso = (hm: string, date = DAY) => new Date(`${date}T${hm}:00+07:00`).toISOString();

beforeEach(async () => {
  at('05:00');
  retryDelays.ms = [0, 0];
  env = makeEnv();
  line = new LineHarness(env);
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
  await link(a, LA);
  line.pushes.length = 0;
  line.replies.length = 0;
});
afterEach(() => {
  freezeNow(null);
  vi.unstubAllGlobals();
});

describe('ตัวช่วยเวลา', () => {
  it.each([
    ['23:00', '22:00', '06:30', true],
    ['03:00', '22:00', '06:30', true],
    ['06:29', '22:00', '06:30', true],
    ['06:30', '22:00', '06:30', false],
    ['12:00', '22:00', '06:30', false],
    ['22:00', '22:00', '06:30', true],
    ['12:00', '13:00', '15:00', false],
    ['14:00', '13:00', '15:00', true],
    ['23:00', '23:00', '23:00', false], // start == end = ไม่มี quiet hours
  ])('quiet %s ใน %s–%s = %s', (hm, s, e, expected) => {
    expect(isQuietHours(hm, s, e)).toBe(expected);
  });
  it('หน้าต่างส่ง: ตั้งแต่เวลาที่ตั้งถึง +120 นาที (รวมขอบ) ไม่ข้ามเที่ยงคืน', () => {
    expect(inWindow('07:29', '07:30')).toBe(false);
    expect(inWindow('07:30', '07:30')).toBe(true);
    expect(inWindow('09:30', '07:30')).toBe(true);
    expect(inWindow('09:31', '07:30')).toBe(false);
    expect(inWindow('00:10', '23:30')).toBe(false);
  });
});

describe('สรุปเช้า (morning digest)', () => {
  beforeEach(async () => {
    await mk(a, {
      title: 'ค้างเมื่อวาน',
      allDay: true,
      dueDate: '2026-11-03',
      urgency: 1,
      importance: 1,
    });
    await mk(a, { title: 'งานสำคัญมาก', startAt: iso('14:00'), urgency: 4, importance: 4 });
    await mk(a, { title: 'งานเล็ก', startAt: iso('11:30'), urgency: 1, importance: 1 });
    await mk(a, { title: 'ส่งใบเสนอราคา', dueAt: iso('17:00'), urgency: 2, importance: 3 });
    await mk(a, { title: 'งานพรุ่งนี้', startAt: iso('09:00', '2026-11-05') });
  });

  it('ไม่ส่งก่อนเวลา; ส่งรอบเดียวเมื่อถึง 07:30 และไม่ส่งซ้ำตลอดวัน', async () => {
    at('07:25');
    await cron();
    expect(line.pushes).toHaveLength(0);
    for (const t of ['07:30', '07:35', '08:00', '09:00', '09:30']) {
      at(t);
      await cron();
    }
    expect(line.pushes).toHaveLength(1);
    expect(line.pushes[0]).toMatchObject({ to: LA, auth: 'Bearer test-line-token' });
    expect(line.pushes[0]!.messages).toHaveLength(1); // 1 push = 1 message object
    expect(await logs()).toEqual([{ kind: 'morning_digest', ok: 1, detail: 'n=4;attempts=1' }]);
  });
  it('รวม เลยกำหนด/เดดไลน์วันนี้/งานวันนี้ ในข้อความเดียว เรียงตาม urgency×importance และไม่รวมงานพรุ่งนี้', async () => {
    at('07:30');
    await cron();
    const t = pushText();
    expect(line.pushes[0]!.messages[0]!.type).toBe('flex');
    for (const s of ['ค้างเมื่อวาน', 'ส่งใบเสนอราคา', 'งานสำคัญมาก', 'งานเล็ก'])
      expect(t).toContain(s);
    expect(t).not.toContain('งานพรุ่งนี้');
    // หัวข้อมีจำนวนต่อท้าย เช่น "งานวันนี้ (2)" (กันชนกับคำว่า "สรุปงานวันนี้" ในหัวการ์ด)
    expect(t.indexOf('เลยกำหนด (')).toBeLessThan(t.indexOf('เดดไลน์วันนี้ ('));
    expect(t.indexOf('เดดไลน์วันนี้ (')).toBeLessThan(t.indexOf('งานวันนี้ ('));
    expect(t.indexOf('งานสำคัญมาก')).toBeLessThan(t.indexOf('งานเล็ก')); // 16 > 1 แม้งานเล็กเริ่มก่อน
  });
  it('หลังส่ง ตอบ "เสร็จ 1" ได้ทันทีตามเลขในข้อความ', async () => {
    at('07:30');
    await cron();
    await line.say(LA, 'เสร็จ 1');
    const done = (
      (await a.call('GET', '/api/tasks')).json.tasks as { title: string; status: string }[]
    ).filter((t) => t.status === 'done');
    expect(done.map((t) => t.title)).toEqual(['ค้างเมื่อวาน']); // ข้อ 1 = รายการแรกในหัวข้อ "เลยกำหนด"
  });
  it('นอกหน้าต่าง (หลัง 09:30) ไม่ส่ง; วันถัดไปส่งใหม่ได้', async () => {
    at('09:31');
    await cron();
    expect(line.pushes).toHaveLength(0);
    at('07:30', '2026-11-05');
    await cron();
    expect(line.pushes).toHaveLength(1);
    expect(pushText()).toContain('งานพรุ่งนี้');
    at('07:30', '2026-11-06');
    await cron();
    expect(line.pushes).toHaveLength(2); // งานค้างจากวันก่อนยังถูกสรุป
  });
  it('วันที่ไม่มีงานเลย → ไม่ส่งและไม่ใช้โควตา แต่ถ้ามีงานเข้ามาในหน้าต่าง ก็ส่งได้', async () => {
    at('07:30', '2026-11-20');
    await b.call('GET', '/api/me');
    const env2 = makeEnv();
    const h2 = new LineHarness(env2);
    const c = new Client(env2);
    await c.login('a@x.com');
    const code = (await c.call('POST', '/api/line/link-code')).json.code;
    await h2.say(LA, `ผูกบัญชี ${code}`);
    h2.pushes.length = 0;
    await runNotifications(env2);
    expect(h2.pushes).toHaveLength(0);
    expect(
      (await env2.DB.prepare('select count(*) as n from notification_log').all()).results[0],
    ).toEqual({ n: 0 });
    await c.call('POST', '/api/tasks', { title: 'งานใหม่', startAt: iso('15:00', '2026-11-20') });
    at('08:30', '2026-11-20');
    await runNotifications(env2);
    expect(h2.pushes).toHaveLength(1);
  });
  it('ผู้ใช้ปิดแจ้งเตือน / ยังไม่ผูก LINE → ไม่ส่ง', async () => {
    await setting(a, { lineNotifyEnabled: false });
    at('07:30');
    await cron();
    expect(line.pushes).toHaveLength(0);
    await mk(b, { title: 'งานของ B', startAt: iso('14:00') }); // B ยังไม่ผูก LINE
    await cron();
    expect(line.pushes).toHaveLength(0);
    await setting(a, { lineNotifyEnabled: true });
    await cron();
    expect(line.pushes).toHaveLength(1);
  });
  it('ปรับเวลา digest ได้ (06:45)', async () => {
    await setting(a, { morningDigestTime: '06:45' });
    at('06:40');
    await cron();
    expect(line.pushes).toHaveLength(0);
    at('06:45');
    await cron();
    expect(line.pushes).toHaveLength(1);
  });
});

describe('Quiet hours', () => {
  beforeEach(async () => {
    await mk(a, { title: 'งานวันนี้', startAt: iso('14:00') });
  });
  it('digest ที่ตรงช่วง quiet hours ไม่ถูกส่ง จนกว่า quiet hours จบ (ถ้ายังอยู่ในหน้าต่าง)', async () => {
    await setting(a, { quietHoursStart: '22:00', quietHoursEnd: '08:00' });
    at('07:30');
    await cron();
    at('07:55');
    await cron();
    expect(line.pushes).toHaveLength(0);
    at('08:00');
    await cron();
    expect(line.pushes).toHaveLength(1);
  });
  it('quiet hours ข้ามเที่ยงคืนบล็อกทั้งการเตือนก่อนเวลา', async () => {
    await mk(a, { title: 'งานดึก', startAt: iso('23:10') });
    at('22:55');
    await cron();
    expect(line.pushes).toHaveLength(0);
    await setting(a, { quietHoursStart: '00:00', quietHoursEnd: '00:00' }); // ปิด quiet hours
    await cron();
    expect(line.pushes).toHaveLength(1);
  });
});

describe('เตือนก่อนเวลา (reminder)', () => {
  it('ส่งครั้งเดียวเมื่อเข้าช่วง 30 นาที พร้อมปุ่ม เสร็จ/เลื่อน/เปิดเว็บ และไม่ส่งซ้ำ', async () => {
    const t = await mk(a, { title: 'ประชุมลูกค้า', startAt: iso('14:20'), endAt: iso('15:00') });
    at('13:49');
    await cron();
    expect(line.pushes).toHaveLength(0);
    at('13:55');
    await cron();
    expect(line.pushes).toHaveLength(1);
    const text = pushText();
    expect(text).toContain('ประชุมลูกค้า');
    expect(text).toContain('อีก 25 นาที');
    expect(text).toContain(`a=done&id=${t.id}`);
    expect(text).toContain(`a=snz&id=${t.id}&m=60`);
    expect(text).toContain(`a=snz&id=${t.id}&d=1`);
    expect(text).toContain(`/?task=${t.id}`);
    for (const m of ['14:00', '14:15']) {
      at(m);
      await cron();
    }
    expect(line.pushes).toHaveLength(1);
    expect(await rows('select kind, sent_at is not null as sent from reminders')).toEqual([
      { kind: 'before', sent: 1 },
    ]);
  });
  it('หลายงานในรอบเดียวรวมเป็นข้อความเดียว (carousel)', async () => {
    await mk(a, { title: 'งาน ก', startAt: iso('14:10') });
    await mk(a, { title: 'งาน ข', startAt: iso('14:25') });
    at('13:56'); // ก อีก 14 นาที, ข อีก 29 นาที (อยู่ในช่วง 30 นาทีทั้งคู่)
    await cron();
    expect(line.pushes).toHaveLength(1);
    const c = line.pushes[0]!.messages[0]!.contents as { type: string; contents: unknown[] };
    expect(c.type).toBe('carousel');
    expect(c.contents).toHaveLength(2);
    expect(await rows('select * from reminders')).toHaveLength(2);
  });
  it('ไม่เตือนงานที่เริ่มไปแล้ว / เสร็จแล้ว / ยกเลิก / ทั้งวัน / ไกลเกินหน้าต่าง', async () => {
    await mk(a, { title: 'เริ่มแล้ว', startAt: iso('13:50') });
    await mk(a, { title: 'เสร็จแล้ว', startAt: iso('14:10'), status: 'done' });
    await mk(a, { title: 'ยกเลิก', startAt: iso('14:10'), status: 'cancelled' });
    await mk(a, { title: 'ทั้งวัน', allDay: true, dueDate: DAY });
    await mk(a, { title: 'ไกล', startAt: iso('16:00') });
    at('14:00');
    await cron();
    expect(line.pushes).toHaveLength(0);
  });
  it('เลื่อนเวลางานหลังเตือนแล้ว → เตือนใหม่ตามเวลาใหม่', async () => {
    const t = await mk(a, { title: 'ย้ายเวลา', startAt: iso('14:20') });
    at('13:55');
    await cron();
    expect(line.pushes).toHaveLength(1);
    await a.call('PATCH', `/api/tasks/${t.id}`, { startAt: iso('15:10') });
    at('14:45');
    await cron();
    expect(line.pushes).toHaveLength(2);
    expect(pushText(1)).toContain('อีก 25 นาที');
  });
  it('เดดไลน์ (due_at) เตือนเป็น "เดดไลน์อีก ..."', async () => {
    await mk(a, { title: 'ส่งรายงาน', dueAt: iso('17:00') });
    at('16:40');
    await cron();
    expect(pushText()).toContain('เดดไลน์อีก 20 นาที');
    expect(await rows('select kind from reminders')).toEqual([{ kind: 'due' }]);
  });
  it('ตั้งเตือนล่วงหน้า 0 = ปิด, 60 นาที = กว้างขึ้น', async () => {
    await mk(a, { title: 'งาน', startAt: iso('14:00') });
    await setting(a, { remindBeforeMinutes: 0 });
    at('13:30');
    await cron();
    expect(line.pushes).toHaveLength(0);
    await setting(a, { remindBeforeMinutes: 60 });
    at('13:05');
    await cron();
    expect(line.pushes).toHaveLength(1);
  });
  it('ผู้ใช้แต่ละคนได้เฉพาะงานของตัวเอง', async () => {
    await link(b, LB);
    line.pushes.length = 0;
    await mk(a, { title: 'ของ A เท่านั้น', startAt: iso('14:10') });
    await mk(b, { title: 'ของ B เท่านั้น', startAt: iso('14:15') });
    at('13:50');
    await cron();
    expect(line.pushes).toHaveLength(2);
    const toA = line.pushes.find((p) => p.to === LA)!;
    const toB = line.pushes.find((p) => p.to === LB)!;
    expect(json(toA.messages)).toContain('ของ A เท่านั้น');
    expect(json(toA.messages)).not.toContain('ของ B');
    expect(json(toB.messages)).toContain('ของ B เท่านั้น');
    expect(json(toB.messages)).not.toContain('ของ A');
  });
  it('ปุ่มเลื่อน 1 ชม. จากข้อความเตือนทำงาน', async () => {
    const t = await mk(a, { title: 'ประชุม', startAt: iso('14:20') });
    at('13:55');
    await cron();
    await line.postback(LA, `a=snz&id=${t.id}&m=60`);
    expect(
      ((await a.call('GET', `/api/tasks/${t.id}`)).json.task as { startAt: string }).startAt,
    ).toBe(iso('15:20'));
  });
});

describe('เตือนเดดไลน์วันนี้ (บ่าย)', () => {
  it('ส่งรอบเดียวตอน 15:00 เฉพาะงานที่มีเดดไลน์วันนี้และยังไม่เสร็จ', async () => {
    await mk(a, { title: 'เดดไลน์ 17:00', dueAt: iso('17:00') });
    await mk(a, { title: 'เดดไลน์พรุ่งนี้', dueAt: iso('17:00', '2026-11-05') });
    await mk(a, { title: 'เดดไลน์เสร็จแล้ว', dueAt: iso('18:00'), status: 'done' });
    await mk(a, { title: 'ทั้งวันวันนี้', allDay: true, dueDate: DAY });
    at('14:59');
    await cron();
    expect(line.pushes.filter((p) => json(p.messages).includes('เดดไลน์วันนี้'))).toHaveLength(0);
    at('15:00');
    await cron();
    at('15:30');
    await cron();
    const alerts = line.pushes.filter((p) => json(p.messages).includes('เดดไลน์วันนี้'));
    expect(alerts).toHaveLength(1);
    const t = json(alerts[0]!.messages);
    expect(t).toContain('เดดไลน์ 17:00');
    for (const s of ['เดดไลน์พรุ่งนี้', 'เดดไลน์เสร็จแล้ว', 'ทั้งวันวันนี้'])
      expect(t).not.toContain(s);
    expect((await logs()).filter((l) => l.kind === 'deadline_alert')).toHaveLength(1);
  });
  it('เดดไลน์ที่เลยเวลาแล้วแต่ยังไม่เสร็จ ถูกบอกว่าเลย และถ้าไม่มีเดดไลน์ ไม่ส่ง', async () => {
    at('15:00');
    await cron();
    expect(line.pushes).toHaveLength(0);
    await mk(a, { title: 'เลยแล้ว', dueAt: iso('12:00') });
    await cron();
    expect(pushText()).toContain('เลยเดดไลน์แล้ว');
  });
});

describe('สรุปเย็น (evening review) และปุ่มเลื่อนงานค้าง', () => {
  async function seed() {
    const d1 = await mk(a, { title: 'เสร็จ 1', startAt: iso('09:00') });
    const d2 = await mk(a, { title: 'เสร็จ 2', allDay: true, dueDate: DAY });
    await a.call('POST', `/api/tasks/${d1.id}/complete`);
    await a.call('POST', `/api/tasks/${d2.id}/complete`);
    const p1 = await mk(a, { title: 'ค้างตอนเย็น', startAt: iso('21:00'), endAt: iso('22:00') });
    const p2 = await mk(a, { title: 'ค้างทั้งวัน', allDay: true, dueDate: DAY });
    const other = await mk(a, { title: 'งานพรุ่งนี้', startAt: iso('10:00', '2026-11-05') });
    return { p1, p2, other };
  }
  it('สรุปเสร็จกี่งาน/ค้างอะไร พร้อมปุ่มเลื่อนไปพรุ่งนี้ ส่งรอบเดียว', async () => {
    await seed();
    at('19:59');
    await cron();
    expect(line.pushes.filter((p) => json(p.messages).includes('สรุปวันนี้'))).toHaveLength(0);
    at('20:00');
    await cron();
    at('20:30');
    await cron();
    const ev = line.pushes.filter((p) => json(p.messages).includes('สรุปวันนี้'));
    expect(ev).toHaveLength(1);
    const t = json(ev[0]!.messages);
    expect(t).toContain('เสร็จแล้ว 2 งาน');
    expect(t).toContain('ยังค้าง 2 งาน');
    expect(t).toContain('ค้างตอนเย็น');
    expect(t).not.toContain('งานพรุ่งนี้');
    expect(t).toContain(`a=carry&d=${DAY}`);
  });
  it('ปิดสรุปเย็นได้ และไม่ส่งถ้าวันนั้นไม่มีทั้งงานเสร็จและงานค้าง', async () => {
    at('20:00');
    await cron();
    expect(line.pushes).toHaveLength(0);
    await seed();
    await setting(a, { eveningReviewEnabled: false });
    await cron();
    expect(line.pushes.filter((p) => json(p.messages).includes('สรุปวันนี้'))).toHaveLength(0);
  });
  it('กดปุ่มเลื่อนงานค้าง: เลื่อนเฉพาะงานของวันนั้น +1 วัน (เวลา/ความยาวคงเดิม) ไม่แตะงานอื่น และกดซ้ำไม่เลื่อนซ้ำ', async () => {
    const { p1, p2, other } = await seed();
    at('20:00');
    await cron();
    await line.postback(LA, `a=carry&d=${DAY}`);
    expect(json(line.replies.at(-1))).toContain('เลื่อน 2 งานไป');
    const g = async (id: string) =>
      (await a.call('GET', `/api/tasks/${id}`)).json.task as Record<string, unknown>;
    expect(await g(p1.id)).toMatchObject({
      startAt: iso('21:00', '2026-11-05'),
      endAt: iso('22:00', '2026-11-05'),
    });
    expect(await g(p2.id)).toMatchObject({ dueDate: '2026-11-05', allDay: true });
    expect(await g(other.id)).toMatchObject({ startAt: iso('10:00', '2026-11-05') });
    const doneStill = (
      (await a.call('GET', '/api/tasks')).json.tasks as {
        title: string;
        status: string;
        startAt: string | null;
      }[]
    ).filter((t) => t.status === 'done');
    expect(doneStill).toHaveLength(2);
    await line.postback(LA, `a=carry&d=${DAY}`);
    expect(json(line.replies.at(-1))).toContain('ไม่มีงานค้างให้เลื่อนแล้ว');
    expect(await g(p1.id)).toMatchObject({ startAt: iso('21:00', '2026-11-05') });
  });
  it('เลื่อนได้ครั้งละไม่เกิน 15 งาน (กัน subrequest เกิน) และบอกจำนวนที่เหลือ', async () => {
    for (let i = 0; i < 17; i++) await mk(a, { title: `ค้าง ${i}`, startAt: iso('21:00') });
    at('20:00');
    await line.postback(LA, `a=carry&d=${DAY}`);
    expect(json(line.replies.at(-1))).toContain('เลื่อน 15 งาน');
    expect(json(line.replies.at(-1))).toContain('ยังมีงานเหลือ');
    await line.postback(LA, `a=carry&d=${DAY}`);
    expect(json(line.replies.at(-1))).toContain('เลื่อน 2 งาน');
  });
  it('ปุ่มเก่า/วันที่ผิดรูปแบบ/วันอนาคต ใช้ไม่ได้; ผู้ใช้อื่นเลื่อนงานของเราไม่ได้', async () => {
    const { p1 } = await seed();
    at('20:00');
    for (const d of ['2026-10-20', '2026-11-05', 'not-a-date', '']) {
      await line.postback(LA, `a=carry&d=${d}`);
      expect(json(line.replies.at(-1))).toContain('หมดอายุ');
    }
    await link(b, LB);
    await line.postback(LB, `a=carry&d=${DAY}`);
    expect(json(line.replies.at(-1))).toContain('ไม่มีงานค้าง');
    expect(
      ((await a.call('GET', `/api/tasks/${p1.id}`)).json.task as { startAt: string }).startAt,
    ).toBe(iso('21:00'));
  });
});

describe('โควตา push', () => {
  const day = async (
    n: number,
    email: string,
    lineId: string,
    extra: Partial<Record<string, string>> = {},
  ) => {
    const e = makeEnv({ ...extra });
    void n;
    void email;
    void lineId;
    return e;
  };
  void day;

  it('หยุดส่งเมื่อถึง PUSH_MONTHLY_LIMIT และแจ้งสถานะ', async () => {
    env.PUSH_MONTHLY_LIMIT = '2';
    await link(b, LB);
    line.pushes.length = 0;
    await mk(a, { title: 'A1', startAt: iso('14:00'), dueAt: iso('17:00') });
    await mk(b, { title: 'B1', startAt: iso('14:00') });
    at('07:30');
    await cron(); // digest A + digest B = 2
    expect(line.pushes).toHaveLength(2);
    at('15:00');
    const r = await cron(); // deadline alert ของ A ต้องถูกบล็อก
    expect(line.pushes).toHaveLength(2);
    expect(r.quotaStop).toBe(true);
    const st = await notificationStatus(env, getDb(env.DB));
    expect(st).toMatchObject({
      used: 2,
      limit: 2,
      exhausted: true,
      nearLimit: true,
      blocked: false,
    });
    expect((await a.call('GET', '/api/notifications/status')).json).toMatchObject({
      used: 2,
      limit: 2,
      exhausted: true,
    });
  });
  it('push ที่ล้มเหลวไม่นับโควตา', async () => {
    await mk(a, { title: 'งาน', startAt: iso('14:00') });
    line.pushFail = [500, 500, 500];
    at('07:30');
    await cron();
    expect(await notificationStatus(env, getDb(env.DB))).toMatchObject({ used: 0 });
    await cron(); // รอบถัดไปสำเร็จ
    expect(await notificationStatus(env, getDb(env.DB))).toMatchObject({ used: 1 });
  });
  it('LINE ตอบ 429 (โควตาเต็ม) → หยุด push ที่เหลือของเดือน และรีเซ็ตเมื่อขึ้นเดือนใหม่', async () => {
    await mk(a, { title: 'งาน', startAt: iso('14:00'), dueAt: iso('17:00') });
    line.pushFail = [429];
    at('07:30');
    await cron();
    expect(line.pushes).toHaveLength(1); // ไม่ retry 429
    expect(await logs()).toEqual([{ kind: 'push_quota_hit', ok: 0, detail: '429' }]);
    at('15:00');
    await cron();
    expect(line.pushes).toHaveLength(1); // ไม่ยิงซ้ำให้ LINE
    expect(await notificationStatus(env, getDb(env.DB))).toMatchObject({
      blocked: true,
      exhausted: true,
    });
    at('07:30', '2026-12-01');
    await mk(a, { title: 'ธันวา', startAt: iso('14:00', '2026-12-01') });
    await cron();
    expect(line.pushes).toHaveLength(2);
  });
  it('ไม่ได้ตั้ง PUSH_MONTHLY_LIMIT → ไม่ push เลย (fail closed กันเกินโควตา)', async () => {
    env.PUSH_MONTHLY_LIMIT = '';
    await mk(a, { title: 'งาน', startAt: iso('14:00') });
    at('07:30');
    const r = await cron();
    expect(line.pushes).toHaveLength(0);
    expect(r.quotaStop).toBe(true);
    expect(await notificationStatus(env, getDb(env.DB))).toMatchObject({
      limitConfigured: false,
      exhausted: true,
    });
  });
  it('นับเฉพาะเดือนปัจจุบัน (ตามเวลาไทย) และ nearLimit เมื่อ ≥ 80%', async () => {
    env.PUSH_MONTHLY_LIMIT = '10';
    const ins = (sentAt: string) =>
      env.DB.prepare(
        "insert into notification_log (id, user_id, channel, kind, sent_at, ok, detail) values (?, 'u', 'line_push', 'morning_digest', ?, 1, '')",
      )
        .bind(crypto.randomUUID(), sentAt)
        .run();
    await ins('2026-10-31T16:59:59.000Z'); // 31 ต.ค. 23:59 ไทย = เดือนก่อน
    for (let i = 0; i < 7; i++) await ins('2026-10-31T17:00:00.000Z'); // 1 พ.ย. 00:00 ไทย
    at('12:00');
    expect(await notificationStatus(env, getDb(env.DB))).toMatchObject({
      used: 7,
      nearLimit: false,
    });
    await ins('2026-11-02T03:00:00.000Z');
    expect(await notificationStatus(env, getDb(env.DB))).toMatchObject({
      used: 8,
      nearLimit: true,
    });
    expect((await new Client(env).call('GET', '/api/notifications/status')).status).toBe(401);
  });
});

describe('ความทนทานของการส่ง', () => {
  beforeEach(async () => {
    await mk(a, { title: 'ชื่องานลับ', startAt: iso('14:00') });
    at('07:30');
  });
  it('500 แล้วสำเร็จ: retry ด้วย retry key เดิม และบันทึกสำเร็จครั้งเดียว', async () => {
    line.pushFail = [500];
    await cron();
    expect(line.pushes).toHaveLength(2);
    expect(line.pushes[0]!.retryKey).toBeTruthy();
    expect(line.pushes[1]!.retryKey).toBe(line.pushes[0]!.retryKey);
    expect(await logs()).toEqual([{ kind: 'morning_digest', ok: 1, detail: 'n=1;attempts=2' }]);
  });
  it('ล้มเหลวติด 3 ครั้งต่อรอบ → log ok=0; รอบถัดไปลองใหม่ แต่จำกัด 3 ครั้งต่อประเภทต่อวัน', async () => {
    line.pushFail = Array(30).fill(500);
    for (let i = 0; i < 6; i++) {
      at(`07:${30 + i * 5}`);
      await cron();
    }
    expect(line.pushes).toHaveLength(9); // 3 รอบ × (1 + 2 retry)
    expect((await logs()).filter((l) => l.ok === 0)).toHaveLength(3);
    expect(await notificationStatus(env, getDb(env.DB))).toMatchObject({ used: 0 });
  });
  it('4xx (เช่น ผู้ใช้บล็อกบอท) ไม่ retry', async () => {
    line.pushFail = [403];
    await cron();
    expect(line.pushes).toHaveLength(1);
    expect(await logs()).toEqual([{ kind: 'morning_digest', ok: 0, detail: 'http_403' }]);
  });
  it('เครือข่ายล่ม (fetch throw) ก็ไม่ทำให้ cron ล้ม', async () => {
    const real = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string, i?: RequestInit) => {
        if (String(u).endsWith('/push')) throw new Error('network down');
        return real(u, i);
      }),
    );
    await expect(cron()).resolves.toMatchObject({ failed: 1 });
    expect(await logs()).toEqual([{ kind: 'morning_digest', ok: 0, detail: 'http_0' }]);
  });
  it('notification_log ไม่เก็บชื่องาน/ข้อความของผู้ใช้', async () => {
    await cron();
    expect(JSON.stringify(await rows('select * from notification_log'))).not.toContain(
      'ชื่องานลับ',
    );
  });
});

describe('เพดานต่อรอบ (Worker ฟรี)', () => {
  it('ถึงเวลาพร้อมกัน 7 คน: รอบแรกส่ง ≤ 5 ที่เหลือรอบถัดไป และทุกคนได้ 1 ครั้ง', async () => {
    const emails = Array.from({ length: 7 }, (_, i) => `u${i}@x.com`);
    const env2 = makeEnv({ ALLOWED_EMAILS: emails.join(',') });
    const h = new LineHarness(env2);
    for (const [i, em] of emails.entries()) {
      const c = new Client(env2);
      await c.login(em);
      const code = (await c.call('POST', '/api/line/link-code')).json.code;
      await h.say(`U${String(i).repeat(32)}`, `ผูกบัญชี ${code}`);
      await c.call('POST', '/api/tasks', { title: `งาน ${i}`, startAt: iso('14:00') });
    }
    h.pushes.length = 0;
    at('07:30');
    await runNotifications(env2);
    expect(h.pushes).toHaveLength(5);
    at('07:35');
    await runNotifications(env2);
    expect(h.pushes).toHaveLength(7);
    expect(new Set(h.pushes.map((p) => p.to)).size).toBe(7);
    at('07:40');
    await runNotifications(env2);
    expect(h.pushes).toHaveLength(7);
  });
});

describe('Cron entry (scheduled)', () => {
  it('scheduled() เรียกระบบแจ้งเตือนผ่าน waitUntil', async () => {
    await mk(a, { title: 'งาน', startAt: iso('14:00') });
    at('07:30');
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (p: Promise<unknown>) => void pending.push(p),
      passThroughOnException() {},
    } as unknown as ExecutionContext;
    await worker.scheduled({} as ScheduledController, env, ctx);
    await Promise.all(pending);
    expect(line.pushes).toHaveLength(1);
  });
  it('scheduled() ไม่ throw แม้ฐานข้อมูลมีปัญหา', async () => {
    const broken = {
      ...env,
      DB: {
        prepare: () => {
          throw new Error('db down');
        },
      },
    } as unknown as typeof env;
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (p: Promise<unknown>) => void pending.push(p),
      passThroughOnException() {},
    } as unknown as ExecutionContext;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await worker.scheduled({} as ScheduledController, broken, ctx);
    await expect(Promise.all(pending)).resolves.toBeDefined();
    spy.mockRestore();
  });
});

describe('API ตั้งค่า', () => {
  it('ค่าเริ่มต้น + บันทึกและอ่านกลับได้ + แสดงสถานะผูก LINE', async () => {
    const g = (await a.call('GET', '/api/settings')).json;
    expect(g.lineLinked).toBe(true);
    expect(g.settings).toEqual({
      morningDigestTime: '07:30',
      eveningReviewTime: '20:00',
      eveningReviewEnabled: true,
      deadlineAlertTime: '15:00',
      remindBeforeMinutes: 30,
      quietHoursStart: '22:00',
      quietHoursEnd: '06:30',
      lineNotifyEnabled: true,
    });
    const p = (
      await setting(a, {
        morningDigestTime: '06:45',
        eveningReviewEnabled: false,
        remindBeforeMinutes: 15,
        quietHoursStart: '23:00',
        quietHoursEnd: '07:00',
        deadlineAlertTime: '16:30',
        eveningReviewTime: '21:15',
        lineNotifyEnabled: false,
      })
    ).json;
    expect(p.settings).toEqual({
      morningDigestTime: '06:45',
      eveningReviewTime: '21:15',
      eveningReviewEnabled: false,
      deadlineAlertTime: '16:30',
      remindBeforeMinutes: 15,
      quietHoursStart: '23:00',
      quietHoursEnd: '07:00',
      lineNotifyEnabled: false,
    });
    expect((await a.call('GET', '/api/settings')).json.settings.morningDigestTime).toBe('06:45');
    expect((await b.call('GET', '/api/settings')).json).toMatchObject({
      lineLinked: false,
      settings: { morningDigestTime: '07:30' },
    });
  });
  it.each([
    [{ morningDigestTime: '25:00' }],
    [{ morningDigestTime: '7:30' }],
    [{ quietHoursStart: '22:60' }],
    [{ eveningReviewTime: 'abc' }],
    [{ remindBeforeMinutes: -1 }],
    [{ remindBeforeMinutes: 1441 }],
    [{ remindBeforeMinutes: 1.5 }],
    [{ remindBeforeMinutes: '30' }],
    [{ lineNotifyEnabled: 'yes' }],
    [{ unknownKey: 1 }],
  ])('ปฏิเสธค่าที่ไม่ถูกต้อง %j', async (body) => {
    const r = await setting(a, body);
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('validation_error');
  });
  it('ต้องล็อกอิน, ตรวจ Origin, และแก้ของผู้ใช้อื่นไม่ได้', async () => {
    expect((await new Client(env).call('GET', '/api/settings')).status).toBe(401);
    expect((await new Client(env).call('PATCH', '/api/settings', {})).status).toBe(401);
    expect(
      (
        await a.call(
          'PATCH',
          '/api/settings',
          { remindBeforeMinutes: 5 },
          { Origin: 'https://evil.example' },
        )
      ).status,
    ).toBe(403);
    await setting(b, { remindBeforeMinutes: 99 });
    expect((await a.call('GET', '/api/settings')).json.settings.remindBeforeMinutes).toBe(30);
  });
});

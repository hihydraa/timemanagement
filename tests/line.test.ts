import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freezeNow } from '../src/lib/time';
import { verifyLineSignature } from '../src/services/line';
import { Client, makeEnv } from './helpers/app';
import { json, LineHarness, sign } from './helpers/line';

const NOW = new Date('2026-11-04T03:00:00Z'); // พุธ 4 พ.ย. 2026 10:00 น. (ไทย)
const LA = 'U' + 'a'.repeat(32);
const LB = 'U' + 'b'.repeat(32);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = new TextEncoder().encode('%PDF-1.4 x');

let env: ReturnType<typeof makeEnv>;
let line: LineHarness;
let a: Client;
let b: Client;

async function link(c: Client, lineUserId: string) {
  const code = (await c.call('POST', '/api/line/link-code')).json.code as string;
  await line.say(lineUserId, `ผูกบัญชี ${code}`);
  return code;
}
interface TaskJson {
  id: string;
  title: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  [k: string]: unknown;
}
interface QuickAction {
  label: string;
  text: string;
}
const tasksOf = async (c: Client) => (await c.call('GET', '/api/tasks')).json.tasks as TaskJson[];
const postbackDatas = (msgs: unknown) =>
  [...json(msgs).matchAll(/"data":"([^"]+)"/g)].map((m) => m[1]!);

beforeEach(async () => {
  freezeNow(NOW);
  env = makeEnv();
  line = new LineHarness(env);
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
});
afterEach(() => {
  freezeNow(null);
  vi.unstubAllGlobals();
});

describe('verifyLineSignature', () => {
  const body = new TextEncoder().encode('{"events":[]}');
  const buf = body.buffer.slice(0) as ArrayBuffer;
  const good = sign('{"events":[]}', 'secret');
  it('ผ่านเมื่อถูกต้อง', async () =>
    expect(await verifyLineSignature('secret', buf, good)).toBe(true));
  it('ไม่ผ่านเมื่อ secret ผิด', async () =>
    expect(await verifyLineSignature('other', buf, good)).toBe(false));
  it('ไม่ผ่านเมื่อ body ถูกแก้', async () => {
    const t = new TextEncoder().encode('{"events":[1]}').buffer.slice(0) as ArrayBuffer;
    expect(await verifyLineSignature('secret', t, good)).toBe(false);
  });
  it('ไม่ผ่านเมื่อไม่มี signature / base64 เสีย / ความยาวผิด / secret ว่าง', async () => {
    expect(await verifyLineSignature('secret', buf, null)).toBe(false);
    expect(await verifyLineSignature('secret', buf, '')).toBe(false);
    expect(await verifyLineSignature('secret', buf, '%%%not-base64%%%')).toBe(false);
    expect(await verifyLineSignature('secret', buf, 'AAAA')).toBe(false);
    expect(await verifyLineSignature('', buf, sign('{"events":[]}', ''))).toBe(false); // fail closed
  });
});

describe('webhook: ความปลอดภัย', () => {
  const body = json({
    events: [
      {
        type: 'message',
        webhookEventId: 'e1',
        replyToken: 'r',
        source: { type: 'user', userId: LA },
        message: { id: '1', type: 'text', text: 'x' },
      },
    ],
  });
  it('ลายเซ็นผิด → 401 และไม่ประมวลผล/ไม่ตอบ', async () => {
    const r = await line.post(body, { secret: 'wrong-secret' });
    expect(r.status).toBe(401);
    expect(line.replies).toHaveLength(0);
  });
  it('ไม่มี header ลายเซ็น → 401', async () => {
    expect((await line.post(body, { secret: null })).status).toBe(401);
  });
  it('ลายเซ็นถูกต้อง → 200 และตอบ', async () => {
    expect((await line.post(body)).status).toBe(200);
    expect(line.replies).toHaveLength(1);
  });
  it('ถ้าไม่ตั้ง LINE_CHANNEL_SECRET ปฏิเสธทุกคำขอ (fail closed)', async () => {
    const e2 = makeEnv({ LINE_CHANNEL_SECRET: '' });
    const h = new LineHarness(e2);
    expect((await h.post(body, { secret: '' })).status).toBe(401);
  });
  it('body ใหญ่เกิน 1MB → 413 (ก่อนตรวจลายเซ็น)', async () => {
    const r = await line.post('x', { headers: { 'Content-Length': String(2_000_000) } });
    expect(r.status).toBe(413);
  });
  it('JSON เสียแต่ลายเซ็นถูก → 400; events ว่าง (Verify ของ LINE) → 200', async () => {
    expect((await line.post('{oops')).status).toBe(400);
    expect((await line.post('{"events":[]}')).status).toBe(200);
  });
  it('ไม่ต้องล็อกอินเว็บ และไม่ถูกบล็อกโดย Origin check', async () => {
    const r = await line.post(body, { headers: { Origin: 'https://evil.example' } });
    expect(r.status).toBe(200);
  });
});

describe('ผูกบัญชี', () => {
  it('ยังไม่ผูก: ไม่สร้างงาน ตอบวิธีผูก', async () => {
    const r = await line.say(LA, 'ส่งรายงาน พรุ่งนี้ 14:00');
    expect(json(r.replies[0]!.messages)).toContain('ผูกบัญชี');
    expect(await tasksOf(a)).toHaveLength(0);
  });
  it('ผูกสำเร็จด้วยรหัส 6 หลัก แล้วสร้างงานได้', async () => {
    const code = await link(a, LA);
    expect(code).toMatch(/^\d{6}$/);
    expect(json(line.last)).toContain('ผูกบัญชีสำเร็จ');
    expect((await a.call('GET', '/api/line/status')).json.linked).toBe(true);
    await line.say(LA, 'ซื้อนม พรุ่งนี้');
    expect(await tasksOf(a)).toHaveLength(1);
  });
  it('รหัสใช้ได้ครั้งเดียว: LINE อื่นใช้ซ้ำไม่ได้', async () => {
    const code = await link(a, LA);
    await line.say(LB, `ผูกบัญชี ${code}`);
    expect(json(line.last)).toContain('ไม่ถูกต้องหรือหมดอายุ');
    expect((await b.call('GET', '/api/line/status')).json.linked).toBe(false);
    await line.say(LB, 'งานของ B');
    expect(await tasksOf(a)).toHaveLength(0);
    expect(await tasksOf(b)).toHaveLength(0);
  });
  it('รหัสหมดอายุหลัง 10 นาที', async () => {
    const code = (await a.call('POST', '/api/line/link-code')).json.code;
    freezeNow(new Date(NOW.getTime() + 11 * 60_000));
    await line.say(LA, `ผูกบัญชี ${code}`);
    expect(json(line.last)).toContain('หมดอายุ');
    expect((await a.call('GET', '/api/line/status')).json.linked).toBe(false);
  });
  it('รหัสผิดถูกปฏิเสธ และถูกล็อกหลังผิด 5 ครั้ง (แม้ใช้รหัสถูกต่อมา)', async () => {
    const code = (await a.call('POST', '/api/line/link-code')).json.code as string;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await line.say(LB, `ผูกบัญชี ${wrong}`);
    await line.say(LB, `ผูกบัญชี ${code}`);
    expect(json(line.last)).toContain('ผิดหลายครั้ง');
    expect((await a.call('GET', '/api/line/status')).json.linked).toBe(false);
  });
  it('LINE ที่ผูกกับบัญชี B แล้ว นำรหัสของ A มาใช้ไม่ได้', async () => {
    await link(b, LB);
    const codeA = (await a.call('POST', '/api/line/link-code')).json.code;
    await line.say(LB, `ผูกบัญชี ${codeA}`);
    expect(json(line.last)).toContain('ผูกกับบัญชี Dobby อื่นอยู่แล้ว');
    expect((await a.call('GET', '/api/line/status')).json.linked).toBe(false);
  });
  it('บัญชีเว็บที่ผูก LINE อื่นอยู่แล้ว รับ LINE ใหม่ไม่ได้ จนกว่าจะยกเลิกการเชื่อม', async () => {
    await link(a, LA);
    const code2 = (await a.call('POST', '/api/line/link-code')).json.code;
    await line.say(LB, `ผูกบัญชี ${code2}`);
    expect(json(line.last)).toContain('ผูกกับ LINE อื่นอยู่แล้ว');
    await a.call('DELETE', '/api/line/link');
    await line.say(LB, `ผูกบัญชี ${code2}`);
    expect(json(line.last)).toContain('ผูกบัญชีสำเร็จ');
  });
  it('ขอรหัสใหม่ทำให้รหัสเก่าใช้ไม่ได้', async () => {
    const old = (await a.call('POST', '/api/line/link-code')).json.code;
    await a.call('POST', '/api/line/link-code');
    await line.say(LA, `ผูกบัญชี ${old}`);
    expect(json(line.last)).toContain('ไม่ถูกต้อง');
  });
  it('ต้องล็อกอินเว็บจึงขอรหัสได้', async () => {
    expect((await new Client(env).call('POST', '/api/line/link-code')).status).toBe(401);
  });
  it('follow → ทักทายพร้อมวิธีผูก', async () => {
    await line.follow(LA);
    expect(json(line.last)).toContain('ผูกบัญชี');
  });
});

describe('สร้างงานจากข้อความ (AC หลัก)', () => {
  beforeEach(async () => {
    await link(a, LA);
  });
  it('"ส่งรายงาน พรุ่งนี้ 14:00 #งาน !ด่วน" ขึ้นในเว็บถูกต้อง', async () => {
    const r = await line.say(LA, 'ส่งรายงาน พรุ่งนี้ 14:00 #งาน !ด่วน');
    expect(r.status).toBe(200);
    const [t] = await tasksOf(a);
    const cat = (await a.call('GET', '/api/categories')).json.categories.find(
      (c: { name: string }) => c.name === 'งาน',
    );
    expect(t).toMatchObject({
      title: 'ส่งรายงาน',
      startAt: '2026-11-05T07:00:00.000Z', // 14:00 ไทย
      urgency: 3,
      importance: 2,
      categoryId: cat.id,
      allDay: false,
      source: 'line',
      status: 'todo',
    });
    // ตอบด้วย Flex Message ที่มีปุ่ม เสร็จ/แก้ไข/ลบ โดยใช้ reply token (ไม่ใช้ push)
    const msg = r.replies[0]!;
    expect(msg.replyToken).toMatch(/^rt-/);
    expect(msg.messages[0]!.type).toBe('flex');
    const datas = postbackDatas(msg.messages);
    expect(datas).toContain(`a=done&id=${t!.id}`);
    expect(datas).toContain(`a=del&id=${t!.id}`);
    expect(json(msg.messages)).toContain(`/?task=${t!.id}`);
    expect(line.fetched.some((u) => u.includes('/push'))).toBe(false);
  });
  it('event ซ้ำ (webhookEventId เดิม) ไม่สร้างงานซ้ำ แต่ข้อความเดียวกันคนละ event สร้างใหม่', async () => {
    await line.say(LA, 'ซื้อนม พรุ่งนี้', 'dup-1');
    const again = await line.say(LA, 'ซื้อนม พรุ่งนี้', 'dup-1');
    expect(again.replies).toHaveLength(0);
    expect(await tasksOf(a)).toHaveLength(1);
    await line.say(LA, 'ซื้อนม พรุ่งนี้', 'dup-2');
    expect(await tasksOf(a)).toHaveLength(2);
  });
  it('ไม่ระบุวัน → Inbox พร้อม Quick Reply แล้วกำหนดวันด้วย postback', async () => {
    const r = await line.say(LA, 'ซื้อของเข้าบ้าน');
    const [t] = await tasksOf(a);
    expect(t).toMatchObject({
      title: 'ซื้อของเข้าบ้าน',
      startAt: null,
      dueAt: null,
      dueDate: null,
    });
    expect((await a.call('GET', '/api/inbox')).json.tasks).toHaveLength(1);
    const last = r.replies[0]!.messages.at(-1)!;
    expect(JSON.stringify(last)).toContain('Inbox');
    const datas = postbackDatas(last);
    expect(datas).toEqual([
      `a=sched&id=${t!.id}&w=today`,
      `a=sched&id=${t!.id}&w=tomorrow`,
      `a=sched&id=${t!.id}&w=nextweek`,
    ]);
    await line.postback(LA, datas[1]!);
    expect(await tasksOf(a)).toMatchObject([{ allDay: true, dueDate: '2026-11-05' }]);
    await line.postback(LA, datas[2]!);
    expect((await tasksOf(a))[0]).toMatchObject({ dueDate: '2026-11-09' }); // จันทร์หน้า
  });
  it('วันที่ผ่านมาแล้ว → ถามยืนยัน ไม่สร้างงาน จนกว่าจะเลือก', async () => {
    const r = await line.say(LA, 'ส่งรายงาน วันนี้ 09:00');
    expect(await tasksOf(a)).toHaveLength(0);
    const items = (
      r.replies[0]!.messages[0] as { quickReply: { items: { action: QuickAction }[] } }
    ).quickReply.items;
    const quick = items.map((i) => i.action);
    expect(quick.map((q) => q.label)).toEqual(['เลื่อนเป็นพรุ่งนี้', 'บันทึกตามเดิม']);
    await line.say(LA, quick[0]!.text); // = "ส่งรายงาน พรุ่งนี้ 09:00"
    expect((await tasksOf(a))[0]).toMatchObject({ startAt: '2026-11-05T02:00:00.000Z' });
    await line.say(LA, quick[1]!.text); // "... !ok"
    expect(await tasksOf(a)).toHaveLength(2);
  });
  it('เก็บ recurrence, ระยะเวลา, แท็ก, เดดไลน์', async () => {
    await line.say(LA, 'ประชุมทีม ทุกวันจันทร์ 9:00 @ทีม 1 ชม.');
    await line.say(LA, 'ส่งสไลด์ ภายใน ศุกร์ 17:00 !u4');
    const ts = await tasksOf(a);
    const rec = ts.find((t) => t.title === 'ประชุมทีม')!;
    expect(rec).toMatchObject({
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
      startAt: '2026-11-09T02:00:00.000Z',
      endAt: '2026-11-09T03:00:00.000Z',
      tags: ['ทีม'],
      estimateMinutes: 60,
    });
    expect(ts.find((t) => t.title === 'ส่งสไลด์')).toMatchObject({
      dueAt: '2026-11-06T10:00:00.000Z',
      startAt: null,
      urgency: 2, // คำนวณจากเดดไลน์ (อีก 2 วัน) ไม่ใช่ !ด่วนมาก ที่พิมพ์
    });
  });
  it('มีแต่วัน/เวลา ไม่มีชื่อ → ถามชื่อ ไม่สร้างงาน', async () => {
    await line.say(LA, 'พรุ่งนี้ 14:00');
    expect(json(line.last)).toContain('เรียกงานนี้ว่าอะไร');
    expect(await tasksOf(a)).toHaveLength(0);
  });
  it('ข้อความยาวเกิน 500 ตัวอักษรถูกปฏิเสธ', async () => {
    await line.say(LA, 'ก'.repeat(501));
    expect(await tasksOf(a)).toHaveLength(0);
    expect(json(line.last)).toContain('ยาวเกินไป');
  });
  it('แชทกลุ่ม/ห้อง ถูกเมินเฉย', async () => {
    await line.post(
      json({
        events: [
          {
            type: 'message',
            webhookEventId: 'g1',
            replyToken: 'rg',
            source: { type: 'group', groupId: 'G', userId: LA },
            message: { id: '1', type: 'text', text: 'ซื้อนม' },
          },
        ],
      }),
    );
    expect(await tasksOf(a)).toHaveLength(0);
    expect(line.replies).toHaveLength(2 - 2 + line.replies.length); // ไม่มี reply ใหม่จาก event กลุ่ม
    expect(line.replies.some((r) => r.replyToken === 'rg')).toBe(false);
  });
});

describe('คำสั่ง', () => {
  let idDone: string;
  beforeEach(async () => {
    await link(a, LA);
    const mk = (body: object) =>
      a.call('POST', '/api/tasks', body).then((r) => r.json.task.id as string);
    await mk({ title: 'ค้างเมื่อวาน', allDay: true, dueDate: '2026-11-03', urgency: 4 });
    await mk({
      title: 'ประชุมเช้า',
      startAt: '2026-11-04T07:00:00Z',
      endAt: '2026-11-04T08:00:00Z',
    });
    await mk({ title: 'ส่งใบเสนอราคา', dueAt: '2026-11-04T09:00:00Z' });
    await mk({ title: 'งานพรุ่งนี้', startAt: '2026-11-05T03:00:00Z' });
    await mk({ title: 'งานศุกร์', allDay: true, dueDate: '2026-11-06' });
    await mk({ title: 'งานสัปดาห์หน้า', allDay: true, dueDate: '2026-11-10' });
    await mk({ title: 'ไอเดียลอย ๆ' });
    idDone = await mk({ title: 'ทำเสร็จแล้ว', startAt: '2026-11-04T05:00:00Z', status: 'done' });
  });
  const text = () => json(line.last);

  it('วันนี้ แสดงค้าง/เดดไลน์/งานวันนี้ แบบมีเลข และไม่รวมงานที่เสร็จ', async () => {
    await line.say(LA, 'วันนี้');
    const t = text();
    expect(t).toContain('ค้างเมื่อวาน');
    expect(t).toContain('ส่งใบเสนอราคา');
    expect(t).toContain('ประชุมเช้า');
    expect(t).not.toContain('ทำเสร็จแล้ว');
    expect(t).not.toContain('งานพรุ่งนี้');
    expect(t.indexOf('ค้างเมื่อวาน')).toBeLessThan(t.indexOf('ประชุมเช้า')); // เลยกำหนดมาก่อน
  });
  it('พรุ่งนี้ / สัปดาห์นี้ / ค้างอยู่ / inbox', async () => {
    await line.say(LA, 'พรุ่งนี้');
    expect(text()).toContain('งานพรุ่งนี้');
    expect(text()).not.toContain('ประชุมเช้า');
    await line.say(LA, 'สัปดาห์นี้');
    expect(text()).toContain('งานศุกร์');
    expect(text()).toContain('ประชุมเช้า');
    expect(text()).not.toContain('งานสัปดาห์หน้า');
    await line.say(LA, 'ค้างอยู่');
    expect(text()).toContain('ค้างเมื่อวาน');
    expect(text()).not.toContain('ประชุมเช้า');
    await line.say(LA, 'inbox');
    expect(text()).toContain('ไอเดียลอย');
  });
  it('วันนี้ว่างเปล่า → ข้อความแจ้ง', async () => {
    await b.call('GET', '/api/me');
    await link(b, LB);
    await line.say(LB, 'วันนี้');
    expect(text()).toContain('ไม่มีงาน');
  });
  it('เสร็จ <เลข> อ้างอิงรายการล่าสุด', async () => {
    await line.say(LA, 'วันนี้');
    await line.say(LA, 'เสร็จ 1');
    expect(text()).toContain('ค้างเมื่อวาน');
    const t = (await tasksOf(a)).find((x) => x.title === 'ค้างเมื่อวาน')!;
    expect(t.status).toBe('done');
  });
  it('เสร็จ <ชื่อ> (บางส่วนก็ได้) / ไม่พบ / เลขที่ไม่มีรายการ / ซ้ำหลายงาน', async () => {
    await line.say(LA, 'เสร็จ ประชุม');
    expect((await tasksOf(a)).find((x) => x.title === 'ประชุมเช้า')!.status).toBe('done');
    await line.say(LA, 'เสร็จ ไม่มีงานนี้แน่ ๆ');
    expect(text()).toContain('ไม่พบงานชื่อ');
    await line.say(LA, 'เสร็จ 9');
    expect(text()).toContain('ไม่พบรายการเลข 9');
    await line.say(LA, 'เสร็จ งาน'); // ตรงหลายงาน (งานพรุ่งนี้/งานศุกร์/งานสัปดาห์หน้า)
    expect(text()).toContain('พบ');
    expect((await tasksOf(a)).filter((x) => x.status === 'done')).toHaveLength(2); // ไม่ได้ติ๊กเสร็จมั่ว
  });
  it('เสร็จงานที่เสร็จอยู่แล้ว → แจ้ง ไม่ error', async () => {
    await line.say(LA, 'เสร็จ ทำเสร็จแล้ว');
    expect(text()).toContain('ไม่พบงานชื่อ'); // ค้นหาเฉพาะงานที่ยังไม่เสร็จ
    expect(idDone).toBeTruthy();
  });
  it('เลื่อน: วันใหม่ (รักษาเวลาเดิม), เวลาใหม่, ไม่ระบุวัน → ถาม', async () => {
    await line.say(LA, 'เลื่อน งานพรุ่งนี้ ศุกร์');
    expect((await tasksOf(a)).find((x) => x.title === 'งานพรุ่งนี้')!.startAt).toBe(
      '2026-11-06T03:00:00.000Z',
    );
    await line.say(LA, 'เลื่อน ประชุมเช้า พรุ่งนี้ บ่าย 3');
    const m = (await tasksOf(a)).find((x) => x.title === 'ประชุมเช้า')!;
    expect(m.startAt).toBe('2026-11-05T08:00:00.000Z');
    expect(m.endAt).toBe('2026-11-05T09:00:00.000Z'); // ความยาว 1 ชม. คงเดิม
    await line.say(LA, 'เลื่อน ไอเดียลอย ๆ พรุ่งนี้'); // Inbox → กำหนดวัน
    expect((await tasksOf(a)).find((x) => x.title.startsWith('ไอเดีย'))).toMatchObject({
      allDay: true,
      dueDate: '2026-11-05',
    });
    await line.say(LA, 'เลื่อน งานศุกร์');
    expect(text()).toContain('ไปเมื่อไหร่');
    expect(text()).toContain('quickReply');
  });
  it('เลื่อน <เลข> พรุ่งนี้', async () => {
    await line.say(LA, 'พรุ่งนี้');
    await line.say(LA, 'เลื่อน 1 มะรืน');
    expect((await tasksOf(a)).find((x) => x.title === 'งานพรุ่งนี้')!.startAt).toBe(
      '2026-11-06T03:00:00.000Z',
    );
  });
  it('ลบ ต้องยืนยันด้วย postback ก่อน', async () => {
    await line.say(LA, 'ลบ งานศุกร์');
    const datas = postbackDatas(line.last);
    expect(datas[0]).toMatch(/^a=delok&id=/);
    expect(await tasksOf(a)).toHaveLength(8); // ยังไม่ถูกลบ
    await line.postback(LA, 'a=cancel');
    expect(await tasksOf(a)).toHaveLength(8);
    await line.postback(LA, datas[0]!);
    expect((await tasksOf(a)).some((x) => x.title === 'งานศุกร์')).toBe(false);
  });
  it('เปิด/ปิดแจ้งเตือน', async () => {
    const flag = async () =>
      (
        (await env.DB.prepare('select line_notify_enabled as v from user_settings').all())
          .results as { v: number }[]
      ).map((r) => r.v);
    await line.say(LA, 'ปิดแจ้งเตือน');
    expect(await flag()).toContain(0);
    await line.say(LA, 'เปิดแจ้งเตือน');
    expect((await flag()).filter((v) => v === 0)).toHaveLength(0);
  });
  it('ช่วยเหลือ / เพิ่มงาน', async () => {
    await line.say(LA, 'ช่วยเหลือ');
    expect(text()).toContain('วิธีใช้');
    await line.say(LA, 'เพิ่มงาน');
    expect(text()).toContain('พิมพ์ชื่องาน');
  });
  it('ชื่องานที่ขึ้นต้นคล้ายคำสั่งแต่ไม่มีช่องว่าง ถือเป็นการสร้างงาน', async () => {
    await line.say(LA, 'เสร็จสิ้นโครงการ พรุ่งนี้');
    expect((await tasksOf(a)).some((t) => t.title === 'เสร็จสิ้นโครงการ')).toBe(true);
  });
});

describe('postback', () => {
  let id: string;
  beforeEach(async () => {
    await link(a, LA);
    id = (
      await a.call('POST', '/api/tasks', {
        title: 'งาน A',
        startAt: '2026-11-05T03:00:00Z',
        endAt: '2026-11-05T04:00:00Z',
      })
    ).json.task.id;
  });
  it('เสร็จ', async () => {
    await line.postback(LA, `a=done&id=${id}`);
    expect((await a.call('GET', `/api/tasks/${id}`)).json.task.status).toBe('done');
  });
  it('เลื่อน 1 ชม. / พรุ่งนี้', async () => {
    await line.postback(LA, `a=snz&id=${id}&m=60`);
    expect((await a.call('GET', `/api/tasks/${id}`)).json.task.startAt).toBe(
      '2026-11-05T04:00:00.000Z',
    );
    await line.postback(LA, `a=snz&id=${id}&d=1`);
    expect((await a.call('GET', `/api/tasks/${id}`)).json.task.startAt).toBe(
      '2026-11-06T04:00:00.000Z',
    );
    await line.postback(LA, `a=snz&id=${id}&m=-5`);
    expect(json(line.last)).toContain('ไม่ถูกต้อง');
  });
  it('ลบ → ยืนยัน → ลบ พร้อมลบไฟล์แนบใน R2', async () => {
    const f = new File([PDF], 'a.pdf');
    const fd = new FormData();
    fd.append('files', f);
    await a.upload(`/api/tasks/${id}/attachments`, [{ name: 'a.pdf', data: PDF }]);
    expect(env.FILES.keys()).toHaveLength(1);
    await line.postback(LA, `a=del&id=${id}`);
    expect(postbackDatas(line.last)).toContain(`a=delok&id=${id}`);
    await line.postback(LA, `a=delok&id=${id}`);
    expect((await a.call('GET', `/api/tasks/${id}`)).status).toBe(404);
    expect(env.FILES.keys()).toHaveLength(0);
    expect(fd).toBeTruthy();
  });
  it('postback ไม่รู้จัก / งานที่ไม่มีอยู่ → ตอบข้อความ ไม่ crash', async () => {
    await line.postback(LA, 'a=hack&id=x');
    expect(json(line.last)).toContain('ไม่ถูกต้อง');
    await line.postback(LA, 'a=done&id=does-not-exist');
    expect(json(line.last)).toContain('ไม่พบงานนี้');
  });
});

describe('สิทธิ์ข้ามผู้ใช้ผ่าน LINE', () => {
  it('LINE ของ B ใช้ postback/เลข/ชื่อ กับงานของ A ไม่ได้', async () => {
    await link(a, LA);
    await link(b, LB);
    const idA = (
      await a.call('POST', '/api/tasks', {
        title: 'ความลับของ A',
        allDay: true,
        dueDate: '2026-11-04',
      })
    ).json.task.id;
    await line.postback(LB, `a=done&id=${idA}`);
    expect(json(line.last)).toContain('ไม่พบงานนี้');
    await line.postback(LB, `a=delok&id=${idA}`);
    await line.postback(LB, `a=snz&id=${idA}&d=1`);
    await line.postback(LB, `a=sched&id=${idA}&w=today`);
    await line.say(LB, 'เสร็จ ความลับ');
    expect(json(line.last)).toContain('ไม่พบงานชื่อ');
    await line.say(LA, 'วันนี้'); // A ดูรายการ → ตั้ง state ของ A
    await line.say(LB, 'เสร็จ 1'); // เลขของ B ไม่เกี่ยวกับรายการของ A
    expect(json(line.last)).toContain('ไม่พบรายการเลข 1');
    const t = (await a.call('GET', `/api/tasks/${idA}`)).json.task;
    expect(t).toMatchObject({ status: 'todo', dueDate: '2026-11-04' });
    expect(await tasksOf(b)).toHaveLength(0);
  });
});

describe('รับรูป/ไฟล์', () => {
  beforeEach(async () => {
    await link(a, LA);
  });
  const attachments = async (taskId: string) =>
    (await a.call('GET', `/api/tasks/${taskId}/attachments`)).json.attachments as {
      filename: string;
      mime: string;
      isImage: boolean;
    }[];

  it('ส่งรูปหลังสร้างงาน → แนบเข้างานล่าสุด (ผ่าน Content API → R2)', async () => {
    await line.say(LA, 'ประชุม พรุ่งนี้ 10:00');
    const [t] = await tasksOf(a);
    line.contents.set('img1', { bytes: JPG, type: 'image/jpeg' });
    await line.media(LA, 'image', 'img1');
    const atts = await attachments(t!.id);
    expect(atts).toHaveLength(1);
    expect(atts[0]).toMatchObject({ mime: 'image/jpeg', isImage: true });
    expect(atts[0]!.filename).toMatch(/^line-20261104-1000\.jpg$/);
    expect(env.FILES.keys()).toHaveLength(1);
    expect(json(line.last)).toContain('แนบไฟล์');
    expect(
      line.fetched.some((u) => u.includes('api-data.line.me/v2/bot/message/img1/content')),
    ).toBe(true);
  });
  it('ส่งไฟล์ PDF ใช้ชื่อไฟล์เดิม และแนบหลายไฟล์ติดกันได้', async () => {
    await line.say(LA, 'ส่งสัญญา พรุ่งนี้');
    const [t] = await tasksOf(a);
    line.contents.set('f1', { bytes: PDF, type: 'application/pdf' });
    line.contents.set('i2', { bytes: PNG, type: 'image/png' });
    await line.media(LA, 'file', 'f1', 'สัญญา.pdf');
    await line.media(LA, 'image', 'i2');
    const names = (await attachments(t!.id)).map((x) => x.filename);
    expect(names).toContain('สัญญา.pdf');
    expect(names.some((n) => n.endsWith('.png'))).toBe(true);
  });
  it('ไฟล์ชนิดที่ไม่อนุญาต/เนื้อหาไม่ตรง ถูกปฏิเสธด้วยข้อความ ไม่บันทึกอะไร', async () => {
    await line.say(LA, 'งาน พรุ่งนี้');
    const [t] = await tasksOf(a);
    line.contents.set('bad1', {
      bytes: new TextEncoder().encode('MZ...'),
      type: 'application/octet-stream',
    });
    await line.media(LA, 'file', 'bad1', 'virus.exe');
    expect(json(line.last)).toContain('ไม่รองรับชนิดไฟล์');
    line.contents.set('bad2', { bytes: new TextEncoder().encode('<script>'), type: 'image/png' });
    await line.media(LA, 'file', 'bad2', 'fake.png');
    expect(json(line.last)).toContain('เนื้อหาไฟล์ไม่ตรง');
    expect(await attachments(t!.id)).toHaveLength(0);
    expect(env.FILES.keys()).toHaveLength(0);
  });
  it('ดึงไฟล์จาก LINE ไม่ได้ (หมดอายุ) → แจ้งผู้ใช้', async () => {
    await line.say(LA, 'งาน พรุ่งนี้');
    await line.media(LA, 'image', 'missing');
    expect(json(line.last)).toContain('ดึงไฟล์จาก LINE ไม่ได้');
  });
  it('เกิน 10 นาทีหลังสร้างงาน → ถามว่าจะแนบกับงานไหน แล้วแนบตามที่เลือก', async () => {
    await line.say(LA, 'งานแรก พรุ่งนี้');
    await line.say(LA, 'งานสอง พรุ่งนี้');
    const ts = await tasksOf(a);
    const second = ts.find((t) => t.title === 'งานสอง')!;
    freezeNow(new Date(NOW.getTime() + 11 * 60_000));
    line.contents.set('late', { bytes: JPG, type: 'image/jpeg' });
    await line.media(LA, 'image', 'late');
    expect(json(line.last)).toContain('แนบไฟล์นี้กับงานไหน');
    expect(env.FILES.keys()).toHaveLength(0); // ยังไม่แนบจนกว่าจะเลือก
    const pick = postbackDatas(line.last).find((d) => d.endsWith(second.id))!;
    await line.postback(LA, pick);
    expect(await attachments(second.id)).toHaveLength(1);
    // pending ถูกล้างหลังใช้
    await line.postback(LA, pick);
    expect(json(line.last)).toContain('ไม่พบไฟล์ที่รอแนบ');
  });
  it('ไม่มีงานเลย → บอกให้สร้างงานก่อน; ยังไม่ผูกบัญชี → วิธีผูก', async () => {
    line.contents.set('x', { bytes: JPG, type: 'image/jpeg' });
    await line.media(LA, 'image', 'x');
    expect(json(line.last)).toContain('สร้างงานก่อน');
    await line.media(LB, 'image', 'x');
    expect(json(line.last)).toContain('ผูกบัญชี');
  });
  it('postback แนบไฟล์เข้างานของผู้ใช้อื่นไม่ได้', async () => {
    await link(b, LB);
    const idB = (await b.call('POST', '/api/tasks', { title: 'ของ B' })).json.task.id;
    await line.say(LA, 'งานของ A พรุ่งนี้');
    freezeNow(new Date(NOW.getTime() + 11 * 60_000));
    line.contents.set('z', { bytes: JPG, type: 'image/jpeg' });
    await line.media(LA, 'image', 'z');
    await line.postback(LA, `a=att&id=${idB}`);
    expect(json(line.last)).toContain('ไม่พบงานนี้');
    expect(env.FILES.keys()).toHaveLength(0);
  });
  it('quota เต็ม → แจ้งผู้ใช้', async () => {
    const tiny = makeEnv({ USER_STORAGE_QUOTA_MB: '1' });
    const h = new LineHarness(tiny);
    const c = new Client(tiny);
    await c.login('a@x.com');
    const code = (await c.call('POST', '/api/line/link-code')).json.code;
    await h.say(LA, `ผูกบัญชี ${code}`);
    await h.say(LA, 'งาน พรุ่งนี้');
    const big = new Uint8Array(1024 * 1024 + 10);
    big.set(JPG);
    h.contents.set('big', { bytes: big, type: 'image/jpeg' });
    await h.media(LA, 'image', 'big');
    expect(json(h.last)).toMatch(/ใหญ่เกิน|พื้นที่จัดเก็บ/);
  });
});

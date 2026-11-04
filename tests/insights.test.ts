import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freezeNow } from '../src/lib/time';
import { csvCell, foldLine, icsText } from '../src/services/export';
import { Client, makeEnv } from './helpers/app';

const at = (hm: string, date = '2026-11-04') => freezeNow(new Date(`${date}T${hm}:00+07:00`));
const iso = (hm: string, date = '2026-11-04') => new Date(`${date}T${hm}:00+07:00`).toISOString();
const PDF = new TextEncoder().encode('%PDF-1.4 x');
// เขียน backslash ผ่านตัวแปร กันความสับสนของการ escape ในสตริง
const BS = String.fromCharCode(92);

let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;
const mk = async (c: Client, body: object) =>
  (await c.call('POST', '/api/tasks', body)).json.task as { id: string };
const complete = (c: Client, id: string) =>
  c.call('POST', `/api/tasks/${encodeURIComponent(id)}/complete`);

beforeEach(async () => {
  at('12:00');
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

describe('Focus sessions', () => {
  const session = (over: object = {}) => ({
    startedAt: iso('11:00'),
    endedAt: iso('11:25'),
    minutes: 25,
    ...over,
  });

  it('บันทึกเซสชัน และอ่านตามวัน พร้อมชื่องานและยอดรวม', async () => {
    const t = await mk(a, { title: 'เขียนรายงาน', startAt: iso('09:00') });
    const r = await a.call('POST', '/api/focus-sessions', session({ taskId: t.id }));
    expect(r.status).toBe(201);
    await a.call(
      'POST',
      '/api/focus-sessions',
      session({ startedAt: iso('11:30'), endedAt: iso('11:40'), minutes: 10 }),
    );
    const l = (await a.call('GET', '/api/focus-sessions')).json;
    expect(l).toMatchObject({ date: '2026-11-04', totalMinutes: 35 });
    expect(
      l.sessions.map((s: { title: string | null; minutes: number }) => [s.title, s.minutes]),
    ).toEqual([
      [null, 10],
      ['เขียนรายงาน', 25],
    ]);
    expect((await a.call('GET', '/api/focus-sessions?date=2026-11-03')).json).toMatchObject({
      sessions: [],
      totalMinutes: 0,
    });
  });
  it.each([
    ['นาที = 0', { minutes: 0 }],
    ['นาที > 240', { minutes: 241, endedAt: iso('11:59'), startedAt: iso('06:00') }],
    ['นาทีไม่ใช่จำนวนเต็ม', { minutes: 1.5 }],
    ['นาทีมากกว่าช่วงเวลาจริง', { minutes: 60 }],
    ['จบก่อนเริ่ม', { startedAt: iso('11:30'), endedAt: iso('11:00'), minutes: 5 }],
    ['จบในอนาคต', { startedAt: iso('12:10'), endedAt: iso('12:35'), minutes: 25 }],
    [
      'เก่าเกิน 3 วัน',
      { startedAt: iso('11:00', '2026-10-25'), endedAt: iso('11:25', '2026-10-25') },
    ],
    ['เวลารูปแบบผิด', { startedAt: 'yesterday' }],
  ])('ปฏิเสธ: %s', async (_n, over) => {
    expect((await a.call('POST', '/api/focus-sessions', session(over))).status).toBe(400);
  });
  it('งานต้องเป็นของเรา; instance ของงานทำซ้ำสร้างแถวจริงให้', async () => {
    const other = await mk(b, { title: 'ของ B', startAt: iso('09:00') });
    expect(
      (await a.call('POST', '/api/focus-sessions', session({ taskId: other.id }))).status,
    ).toBe(404);
    expect((await a.call('POST', '/api/focus-sessions', session({ taskId: 'nope' }))).status).toBe(
      404,
    );
    const p = await mk(a, {
      title: 'ประจำวัน',
      startAt: iso('09:00'),
      recurrenceRule: 'FREQ=DAILY',
    });
    const r = await a.call(
      'POST',
      '/api/focus-sessions',
      session({ taskId: `${p.id}~2026-11-05` }),
    );
    expect(r.status).toBe(201);
    expect(r.json.session.taskId).not.toContain('~');
  });
  it('ผู้ใช้อื่นไม่เห็นเซสชันของเรา; ต้องล็อกอิน; ตรวจ Origin', async () => {
    await a.call('POST', '/api/focus-sessions', session());
    expect((await b.call('GET', '/api/focus-sessions')).json.totalMinutes).toBe(0);
    expect((await new Client(env).call('GET', '/api/focus-sessions')).status).toBe(401);
    expect(
      (await a.call('POST', '/api/focus-sessions', session(), { Origin: 'https://evil.example' }))
        .status,
    ).toBe(403);
    expect((await a.call('GET', '/api/focus-sessions?date=abc')).status).toBe(400);
  });
});

describe('Weekly review และ Stats', () => {
  let work = '';
  let personal = '';
  beforeEach(async () => {
    const cats = (await a.call('GET', '/api/categories')).json.categories as {
      id: string;
      name: string;
    }[];
    work = cats.find((c) => c.name === 'งาน')!.id;
    personal = cats.find((c) => c.name === 'ส่วนตัว')!.id;
    // สัปดาห์ 26 ต.ค.–1 พ.ย. 2026
    at('08:00', '2026-10-26');
    const P = await mk(a, {
      title: 'ออกกำลังกาย',
      startAt: iso('07:00', '2026-10-26'),
      endAt: iso('07:30', '2026-10-26'),
      recurrenceRule: 'FREQ=DAILY',
    });
    at('09:00', '2026-10-27');
    const t1 = await mk(a, {
      title: 'งานเขียน',
      categoryId: work,
      startAt: iso('09:00', '2026-10-27'),
      estimateMinutes: 60,
    });
    await complete(a, t1.id);
    await complete(a, `${P.id}~2026-10-27`);
    at('09:47', '2026-10-27');
    await a.call('POST', '/api/focus-sessions', {
      taskId: t1.id,
      startedAt: iso('09:10', '2026-10-27'),
      endedAt: iso('09:35', '2026-10-27'),
      minutes: 25,
    });
    await a.call('POST', '/api/focus-sessions', {
      startedAt: iso('09:36', '2026-10-27'),
      endedAt: iso('09:46', '2026-10-27'),
      minutes: 10,
    });
    at('10:00', '2026-10-28');
    const t2 = await mk(a, {
      title: 'ประชุมลูกค้า',
      categoryId: work,
      startAt: iso('14:00', '2026-10-28'),
      estimateMinutes: 30,
    });
    at('18:00', '2026-10-29');
    await complete(a, t2.id);
    await mk(a, { title: 'ยกเลิกแล้ว', startAt: iso('10:00', '2026-10-29'), status: 'cancelled' });
    await mk(a, { title: 'ซื้อของ', categoryId: personal, allDay: true, dueDate: '2026-10-30' }); // ไม่ได้ทำ
    at('16:00', '2026-10-31');
    const t4 = await mk(a, {
      title: 'ไปตัดผม',
      categoryId: personal,
      startAt: iso('15:00', '2026-10-31'),
    });
    await complete(a, t4.id);
    at('15:46', '2026-10-31');
    await a.call('POST', '/api/focus-sessions', {
      taskId: t4.id,
      startedAt: iso('15:00', '2026-10-31'),
      endedAt: iso('15:45', '2026-10-31'),
      minutes: 45,
    });
    at('12:00');
  });

  it('รีวิวสัปดาห์ที่แล้ว (ค่าเริ่มต้น): เสร็จ/เลยกำหนด/อัตรา/เวลาตามประเภท/สัปดาห์หน้า', async () => {
    const w = (await a.call('GET', '/api/stats/weekly')).json;
    expect(w).toMatchObject({
      weekStart: '2026-10-26',
      weekEnd: '2026-11-01',
      completed: 4,
      scheduled: 11,
      scheduledDone: 4,
      completionRate: 36.4,
      overdueOpen: 7,
      focusMinutes: 80,
    });
    const by = (id: string | null) =>
      w.byCategory.find((c: { categoryId: string | null }) => c.categoryId === id);
    expect(by(work)).toMatchObject({
      name: 'งาน',
      focusMinutes: 25,
      plannedMinutes: 90,
      completed: 2,
    });
    expect(by(personal)).toMatchObject({ focusMinutes: 45, completed: 1 });
    expect(by(null)).toMatchObject({ name: 'ไม่มีประเภท', focusMinutes: 10, completed: 1 });
    expect(w.completedTasks.map((t: { title: string }) => t.title).sort()).toEqual([
      'งานเขียน',
      'ประชุมลูกค้า',
      'ออกกำลังกาย',
      'ไปตัดผม',
    ]);
    expect(w.notDoneTasks.length).toBe(7);
    expect(w.nextWeek).toMatchObject({ weekStart: '2026-11-02', weekEnd: '2026-11-08', total: 7 }); // ออกกำลังกายรายวัน
  });
  it('เลือกสัปดาห์ด้วยวันใดก็ได้ในสัปดาห์ (ปรับเป็นวันจันทร์) และสัปดาห์นี้นับครั้งเสมือนถึงวันนี้เท่านั้น', async () => {
    const same = (await a.call('GET', '/api/stats/weekly?week=2026-10-28')).json;
    expect(same.weekStart).toBe('2026-10-26');
    expect(same.completed).toBe(4);
    const cur = (await a.call('GET', '/api/stats/weekly?week=2026-11-02')).json;
    expect(cur).toMatchObject({
      weekStart: '2026-11-02',
      scheduled: 3,
      scheduledDone: 0,
      completed: 0,
    }); // 2,3,4 พ.ย.
    expect((await a.call('GET', '/api/stats/weekly?week=nope')).status).toBe(400);
  });
  it('ภาพรวม 30 วัน: อัตราสำเร็จ รายวัน สัดส่วนประเภท streak', async () => {
    const o = (await a.call('GET', '/api/stats/overview')).json;
    expect(o).toMatchObject({
      days: 30,
      from: '2026-10-06',
      to: '2026-11-04',
      scheduled: 14,
      scheduledDone: 4,
      completionRate: 28.6,
      completedTotal: 4,
      focusMinutes: 80,
    });
    expect(o.daily).toHaveLength(30);
    const day = (d: string) => o.daily.find((x: { date: string }) => x.date === d);
    expect(day('2026-10-27').completed).toBe(2);
    expect(day('2026-10-29').completed).toBe(1);
    expect(day('2026-11-02').completed).toBe(0);
    expect(o.streak).toEqual({ current: 0, best: 1 });
    expect(o.totals.open).toBe(2); // ซื้อของ + งานแม่ออกกำลังกายครั้งแรก
  });
  it('streak: นับวันติดกัน (วันนี้ยังไม่ทำ ไม่ตัดถ้าเมื่อวานทำ) และ doneThisWeek', async () => {
    at('09:00', '2026-11-02');
    await complete(a, (await mk(a, { title: 'จ.' })).id);
    at('09:00', '2026-11-03');
    await complete(a, (await mk(a, { title: 'อ.' })).id);
    at('12:00');
    let o = (await a.call('GET', '/api/stats/overview')).json;
    expect(o.streak).toEqual({ current: 2, best: 2 }); // 2,3 พ.ย. (วันนี้ 4 ยังไม่ทำ)
    await complete(a, (await mk(a, { title: 'พ.' })).id);
    o = (await a.call('GET', '/api/stats/overview')).json;
    expect(o.streak).toEqual({ current: 3, best: 3 });
    expect(o.totals.doneThisWeek).toBe(3);
    at('12:00', '2026-11-06'); // ข้าม 2 วันไม่ทำ → streak ขาด
    o = (await a.call('GET', '/api/stats/overview')).json;
    expect(o.streak.current).toBe(0);
    expect(o.streak.best).toBe(3);
  });
  it('ตรวจพารามิเตอร์ days และสิทธิ์', async () => {
    for (const d of ['6', '91', 'abc', ''])
      expect((await a.call('GET', `/api/stats/overview?days=${d}`)).status, d).toBe(400);
    expect((await a.call('GET', '/api/stats/overview?days=7')).json.daily).toHaveLength(7);
    // ผู้ใช้อื่นเห็นเฉพาะข้อมูลของตัวเอง (ว่าง)
    expect((await b.call('GET', '/api/stats/weekly')).json).toMatchObject({
      completed: 0,
      scheduled: 0,
      focusMinutes: 0,
      completionRate: null,
    });
    expect((await b.call('GET', '/api/stats/overview')).json).toMatchObject({
      completedTotal: 0,
      completionRate: null,
      streak: { current: 0, best: 0 },
    });
    expect((await new Client(env).call('GET', '/api/stats/weekly')).status).toBe(401);
    expect((await new Client(env).call('GET', '/api/stats/overview')).status).toBe(401);
  });
});

describe('Matrix endpoint', () => {
  it('คืนงานที่ยังไม่เสร็จของเราเท่านั้น เรียงตามความเร่งด่วน×สำคัญ', async () => {
    await mk(a, { title: 'เล็ก', urgency: 1, importance: 1 });
    await mk(a, { title: 'ใหญ่', urgency: 4, importance: 4 });
    const done = await mk(a, { title: 'เสร็จแล้ว', urgency: 4, importance: 4 });
    await complete(a, done.id);
    await mk(b, { title: 'ของ B', urgency: 4, importance: 4 });
    const r = (await a.call('GET', '/api/matrix')).json.tasks as { title: string }[];
    expect(r.map((t) => t.title)).toEqual(['ใหญ่', 'เล็ก']);
    expect((await new Client(env).call('GET', '/api/matrix')).status).toBe(401);
  });
});

describe('Export', () => {
  const unfold = (s: string) => s.replace(/\r\n /g, '');
  async function seed() {
    const cat = (await a.call('GET', '/api/categories')).json.categories[0] as {
      id: string;
      name: string;
    };
    const t1 = await mk(a, {
      title: 'ประชุมทีม',
      description: 'ห้อง A, ชั้น 2; เตรียม "สไลด์"\nบรรทัดสอง',
      categoryId: cat.id,
      startAt: iso('14:00', '2026-11-05'),
      endAt: iso('15:30', '2026-11-05'),
      tags: ['ทีม', 'สำคัญ'],
      urgency: 4,
      importance: 3,
    });
    await a.call('POST', `/api/tasks/${t1.id}/subtasks`, { title: 'เตรียมวาระ' });
    const s2 = (await a.call('POST', `/api/tasks/${t1.id}/subtasks`, { title: 'จองห้อง' })).json
      .subtask;
    await a.call('PATCH', `/api/subtasks/${s2.id}`, { done: true });
    await a.upload(`/api/tasks/${t1.id}/attachments`, [{ name: 'วาระ.pdf', data: PDF }]);
    await mk(a, { title: 'ทั้งวัน', allDay: true, dueDate: '2026-11-30' });
    await mk(a, { title: 'ส่งใบเสนอราคา', dueAt: iso('17:00', '2026-11-06') });
    await mk(a, { title: 'ไม่มีวัน' });
    await mk(a, { title: 'ยกเลิก', startAt: iso('10:00', '2026-11-05'), status: 'cancelled' });
    const done = await mk(a, { title: 'งานเสร็จ', startAt: iso('08:00', '2026-11-05') });
    await complete(a, done.id);
    await mk(b, { title: 'ความลับของ B', startAt: iso('09:00', '2026-11-05'), tags: ['ลับของ-B'] });
    return { t1, cat };
  }

  it('JSON: ข้อมูลครบ (แท็ก/รายการย่อย/ไฟล์แนบเฉพาะข้อมูลไฟล์) เฉพาะของเรา และไม่มีความลับ', async () => {
    await seed();
    const res = await a.raw('GET', '/api/export?format=json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="dobby-2026-11-04.json"',
    );
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const text = await res.text();
    const d = JSON.parse(text);
    expect(d.user.email).toBe('a@x.com');
    expect(d.categories).toHaveLength(6);
    const t = d.tasks.find((x: { title: string }) => x.title === 'ประชุมทีม');
    expect(t).toMatchObject({
      tags: ['สำคัญ', 'ทีม'].sort(),
      urgency: 4,
      subtasks: [
        { title: 'เตรียมวาระ', done: false },
        { title: 'จองห้อง', done: true },
      ],
      attachments: [{ filename: 'วาระ.pdf', mime: 'application/pdf' }],
    });
    expect(d.tasks.some((x: { title: string }) => x.title.includes('B'))).toBe(false);
    for (const secret of [
      'userId',
      'user_id',
      'refresh',
      'lineUserId',
      'gcalEventId',
      'r2Key',
      'ความลับของ B',
      'ลับของ-B',
    ])
      expect(text, secret).not.toContain(secret);
    expect((await a.raw('GET', '/api/export')).headers.get('content-type')).toContain('json'); // ค่าเริ่มต้น
  });
  it('CSV: BOM, หัวคอลัมน์, quoting, เวลาไทย, หมวด, แท็ก, รายการย่อย', async () => {
    await seed();
    const res = await a.raw('GET', '/api/export?format=csv');
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('dobby-2026-11-04.csv');
    const buf = new Uint8Array(await res.arrayBuffer());
    const bomBytes = [...buf.slice(0, 3)];
    const text = new TextDecoder('utf-8', { ignoreBOM: true, fatal: false }).decode(buf);
    expect(bomBytes).toEqual([0xef, 0xbb, 0xbf]); // BOM (Response.text() ตัด BOM ทิ้ง จึงตรวจที่ไบต์)
    const rows = text.slice(1).trimEnd().split('\r\n');
    expect(rows[0]).toContain('"id","title","description","category","status"');
    expect(text).toContain('"2026-11-05 14:00"');
    expect(text).toContain('"2026-11-05 15:30"');
    expect(text).toContain('"ทีม สำคัญ"');
    expect(text).toContain('"[ ] เตรียมวาระ; [x] จองห้อง"');
    expect(text).toContain('"ห้อง A, ชั้น 2; เตรียม ""สไลด์""\nบรรทัดสอง"'); // quote ซ้อน + ขึ้นบรรทัดใหม่ในเซลล์
    expect(text).not.toContain('ความลับของ B');
    expect(text.split('"ประชุมทีม"').length).toBe(2);
  });
  it('csvCell: กัน formula injection และ escape', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    for (const lead of ['+1', '-1', '@SUM(A1)', '\tcmd', '\rcmd'])
      expect(csvCell(lead).startsWith(`"'`), lead).toBe(true);
    expect(csvCell('ปกติ')).toBe('"ปกติ"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(5)).toBe('"5"');
    expect(csvCell('a,b"c')).toBe('"a,b""c"');
  });
  it('CSV: ชื่องานที่ขึ้นต้นด้วย = ถูกป้องกันจริงในไฟล์', async () => {
    await mk(a, { title: '=cmd|"/c calc"!A1', startAt: iso('09:00', '2026-11-05') });
    const text = await (await a.raw('GET', '/api/export?format=csv')).text();
    expect(text).toContain(`"'=cmd|""/c calc""!A1"`);
    expect(text).not.toMatch(/(^|,)"=cmd/m);
  });
  it('ICS: โครงสร้าง เวลา UTC/ทั้งวัน/เดดไลน์ ✅ และไม่รวมงานยกเลิก/ไม่มีวัน', async () => {
    await seed();
    const res = await a.raw('GET', '/api/export?format=ics');
    expect(res.headers.get('content-type')).toContain('text/calendar');
    expect(res.headers.get('content-disposition')).toContain('dobby-2026-11-04.ics');
    const raw = await res.text();
    expect(raw.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(raw.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(raw.includes('\n') && !/[^\r]\n/.test(raw)).toBe(true); // CRLF ล้วน
    const ics = unfold(raw);
    expect(ics.split('\r\n').filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(4); // ประชุม, ทั้งวัน, เดดไลน์, งานเสร็จ
    expect(ics).toContain('DTSTART:20261105T070000Z');
    expect(ics).toContain('DTEND:20261105T083000Z');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261130');
    expect(ics).toContain('DTEND;VALUE=DATE:20261201');
    expect(ics).toContain('SUMMARY:⏰ ส่งใบเสนอราคา');
    expect(ics).toContain('DTSTART:20261106T093000Z'); // บล็อก 30 นาทีจบที่ 17:00 ไทย
    expect(ics).toContain('SUMMARY:✅ งานเสร็จ');
    expect(ics).toContain('SUMMARY:ประชุมทีม');
    expect(ics).toContain(
      `DESCRIPTION:ห้อง A${BS}, ชั้น 2${BS}; เตรียม "สไลด์"${BS}nบรรทัดสอง${BS}n[ ] เตรียมวาระ${BS}n[x] จองห้อง`,
    );
    expect(ics).toContain('CATEGORIES:งาน,ทีม,สำคัญ');
    expect(ics).toMatch(/URL:http:\/\/localhost:5173\/\?task=[0-9a-f-]{36}/);
    for (const hidden of ['ยกเลิก', 'ไม่มีวัน', 'ความลับของ B']) expect(ics).not.toContain(hidden);
  });
  it('ICS: งานทำซ้ำ มี RRULE (UNTIL เป็น UTC สำหรับงานมีเวลา) และ EXDATE ของครั้งที่แก้เฉพาะ', async () => {
    const p = await mk(a, {
      title: 'ซีรีส์',
      startAt: iso('09:00', '2026-11-02'),
      endAt: iso('10:00', '2026-11-02'),
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231',
    });
    await a.call('PATCH', `/api/tasks/${p.id}~2026-11-09`, { title: 'ครั้งพิเศษ' });
    const all = await mk(a, {
      title: 'รายวัน',
      allDay: true,
      dueDate: '2026-11-04',
      recurrenceRule: 'FREQ=DAILY;UNTIL=20261231',
    });
    await a.call('DELETE', `/api/tasks/${all.id}~2026-11-06`);
    const ics = unfold(await (await a.raw('GET', '/api/export?format=ics')).text());
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T165959Z');
    expect(ics).toContain('EXDATE:20261109T020000Z'); // 09:00 ไทย = 02:00Z
    expect(ics).toContain('RRULE:FREQ=DAILY;UNTIL=20261231');
    expect(ics).toContain('EXDATE;VALUE=DATE:20261106');
    expect(ics).toContain('SUMMARY:ครั้งพิเศษ'); // แถวจริงของครั้งนั้นส่งเป็น event แยก
    expect(ics).not.toContain('SUMMARY:รายวัน\r\n' + 'x'); // กันหลงทาง
  });
  it('ICS: ฉีดบรรทัดคำสั่งผ่านชื่อ/รายละเอียดไม่ได้ และตัดบรรทัด ≤ 75 ไบต์โดยไม่ตัดอักษรไทยกลางตัว', async () => {
    await mk(a, {
      title: 'x\r\nBEGIN:VEVENT\r\nSUMMARY:evil',
      description: 'a;b,c\\d\nEND:VCALENDAR',
      startAt: iso('09:00', '2026-11-05'),
    });
    await mk(a, { title: 'ก'.repeat(120) + 'ข'.repeat(60), startAt: iso('10:00', '2026-11-05') });
    const raw = await (await a.raw('GET', '/api/export?format=ics')).text();
    const ics = unfold(raw);
    const lines = ics.split('\r\n'); // นับ "บรรทัดคำสั่ง" จริง (ข้อความที่ escape แล้วอยู่ในค่า SUMMARY/DESCRIPTION ไม่ใช่คำสั่ง)
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(lines.filter((l) => l === 'END:VCALENDAR')).toHaveLength(1);
    expect(lines.some((l) => l.startsWith('SUMMARY:evil'))).toBe(false);
    expect(ics).toContain(`SUMMARY:x${BS}nBEGIN:VEVENT${BS}nSUMMARY:evil`);
    expect(ics).toContain(`DESCRIPTION:a${BS};b${BS},c${BS}${BS}d${BS}nEND:VCALENDAR`);
    for (const line of raw.split('\r\n'))
      expect(new TextEncoder().encode(line).length, line).toBeLessThanOrEqual(75);
    expect(ics).toContain('ก'.repeat(120) + 'ข'.repeat(60)); // ต่อกลับแล้วครบ ไม่มีอักษรเสีย
    expect(raw).not.toContain('�');
  });
  it('foldLine / icsText หน่วยย่อย', () => {
    const line = 'SUMMARY:' + 'สวัสดี'.repeat(40);
    const folded = foldLine(line);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    for (const l of folded.split('\r\n'))
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(foldLine('short')).toBe('short');
    expect(icsText(`a${BS}b;c,d\r\ne\rf\ng`)).toBe(
      `a${BS}${BS}b${BS};c${BS},d${BS}ne${BS}nf${BS}ng`,
    );
  });
  it('ตรวจรูปแบบ, ต้องล็อกอิน, แต่ละคนได้เฉพาะของตัวเอง', async () => {
    expect((await a.call('GET', '/api/export?format=xml')).status).toBe(400);
    expect((await new Client(env).call('GET', '/api/export?format=json')).status).toBe(401);
    await mk(a, { title: 'ของ A', startAt: iso('09:00', '2026-11-05') });
    await mk(b, { title: 'ของ B', startAt: iso('09:00', '2026-11-05') });
    const forB = await (await b.raw('GET', '/api/export?format=ics')).text();
    expect(forB).toContain('ของ B');
    expect(forB).not.toContain('ของ A');
  });
});

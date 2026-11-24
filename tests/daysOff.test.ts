import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { freezeNow } from '../src/lib/time';
import { isYmd } from '../src/lib/daysOff';
import { Client, makeEnv } from './helpers/app';

let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;
beforeEach(async () => {
  freezeNow(new Date('2026-11-12T10:00:00+07:00')); // พฤหัส
  env = makeEnv();
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
});
afterEach(() => freezeNow(null));

const add = (c: Client, body: object) => c.call('POST', '/api/days-off', body);
const list = (c: Client, q = '') => c.call('GET', `/api/days-off${q}`);

describe('isYmd', () => {
  it('รับเฉพาะวันที่จริงในช่วงปี 2000–2100', () => {
    expect(isYmd('2026-11-12')).toBe(true);
    expect(isYmd('2024-02-29')).toBe(true);
    expect(isYmd('2026-02-29')).toBe(false);
    expect(isYmd('2026-13-01')).toBe(false);
    expect(isYmd('2026-1-1')).toBe(false);
    expect(isYmd('1999-12-31')).toBe(false);
    expect(isYmd('2101-01-01')).toBe(false);
  });
});

describe('วันหยุดงาน', () => {
  it('ต้องล็อกอิน', async () => {
    const anon = new Client(env);
    expect((await list(anon)).status).toBe(401);
    expect((await add(anon, { from: '2026-11-12' })).status).toBe(401);
    expect((await anon.call('DELETE', '/api/days-off/x')).status).toBe(401);
  });

  it('บันทึกวันเดียว: ได้ 201 มีประเภท/โน้ต และอ่านกลับได้ (ปีนี้เป็นค่าเริ่มต้น)', async () => {
    const r = await add(a, { from: '2026-11-12', kind: 'sick', note: 'ไข้หวัด' });
    expect(r.status).toBe(201);
    expect(r.json.created).toBe(1);
    const j = (await list(a)).json;
    expect(j.daysOff).toHaveLength(1);
    expect(j.daysOff[0]).toMatchObject({ date: '2026-11-12', kind: 'sick', note: 'ไข้หวัด' });
    expect(j.summary).toEqual({
      total: 1,
      byKind: { vacation: 0, sick: 1, personal: 0, holiday: 0, other: 0 },
    });
  });

  it('วันเดียวบันทึกได้แม้เป็นวันเสาร์ (ผู้ใช้เลือกเอง)', async () => {
    expect((await add(a, { from: '2026-11-14' })).json.created).toBe(1); // เสาร์
  });

  it('ช่วงหลายวัน: ข้ามเสาร์-อาทิตย์ตามวันทำงานที่ตั้งไว้ (จันทร์–ศุกร์)', async () => {
    const r = await add(a, { from: '2026-11-09', to: '2026-11-16', kind: 'vacation' }); // จันทร์→จันทร์
    expect(r.status).toBe(201);
    expect(r.json.created).toBe(6); // จ-ศ + จ ถัดไป
    expect(r.json.daysOff.map((d: { date: string }) => d.date)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-16',
    ]);
  });

  it('ช่วงหลายวัน onlyWorkDays=false: ลงทุกวัน; ช่วงที่ไม่มีวันทำงานเลย → 400', async () => {
    expect(
      (await add(a, { from: '2026-11-09', to: '2026-11-15', onlyWorkDays: false })).json.created,
    ).toBe(7);
    const none = await add(b, { from: '2026-11-14', to: '2026-11-15' }); // เสาร์-อาทิตย์
    expect(none.status).toBe(400);
    expect(none.json.error.code).toBe('no_work_days');
  });

  it('บันทึกซ้ำวันเดิม = แก้ประเภท/โน้ต (ไม่เกิดแถวซ้ำ)', async () => {
    await add(a, { from: '2026-11-12', kind: 'vacation', note: 'เดิม' });
    const r = await add(a, { from: '2026-11-12', kind: 'personal', note: 'ใหม่' });
    expect(r.json.created).toBe(0);
    expect(r.json.updated).toBe(1);
    const j = (await list(a)).json;
    expect(j.daysOff).toHaveLength(1);
    expect(j.daysOff[0]).toMatchObject({ kind: 'personal', note: 'ใหม่' });
  });

  it('ข้อมูลผิด → 400: วันที่ไม่จริง, to ก่อน from, ประเภทแปลก, ช่วงเกิน 90 วัน, ฟิลด์เกิน', async () => {
    expect((await add(a, { from: '2026-02-30' })).status).toBe(400);
    expect((await add(a, { from: '2026-11-12', to: '2026-11-10' })).status).toBe(400);
    expect((await add(a, { from: '2026-11-12', kind: 'nap' })).status).toBe(400);
    expect((await add(a, { from: '2026-01-01', to: '2026-12-31' })).status).toBe(400);
    expect((await add(a, { from: '2026-11-12', hack: 1 })).status).toBe(400);
    expect((await add(a, { from: '2026-11-12', note: 'x'.repeat(201) })).status).toBe(400);
  });

  it('ดึงตามช่วง from/to และสรุปแยกประเภท; ช่วงกว้างเกินไป → 400', async () => {
    await add(a, { from: '2026-01-05', kind: 'vacation' });
    await add(a, { from: '2026-06-01', kind: 'sick' });
    await add(a, { from: '2026-06-02', kind: 'sick' });
    await add(a, { from: '2025-12-31', kind: 'other' });
    const all = (await list(a)).json; // ปี 2026
    expect(all.summary.total).toBe(3);
    expect(all.summary.byKind).toMatchObject({ vacation: 1, sick: 2, other: 0 });
    const june = (await list(a, '?from=2026-06-01&to=2026-06-30')).json;
    expect(june.daysOff).toHaveLength(2);
    expect((await list(a, '?from=2020-01-01&to=2026-12-31')).status).toBe(400);
    expect((await list(a, '?from=2026-06-30&to=2026-06-01')).status).toBe(400);
  });

  it('แก้ประเภท/โน้ต และลบ', async () => {
    const id = (await add(a, { from: '2026-11-12' })).json.daysOff[0].id;
    const p = await a.call('PATCH', `/api/days-off/${id}`, {
      kind: 'holiday',
      note: 'วันหยุดบริษัท',
    });
    expect(p.status).toBe(200);
    expect(p.json.dayOff).toMatchObject({ kind: 'holiday', note: 'วันหยุดบริษัท' });
    expect((await a.call('PATCH', `/api/days-off/${id}`, {})).status).toBe(400);
    expect((await a.call('DELETE', `/api/days-off/${id}`)).status).toBe(200);
    expect((await list(a)).json.daysOff).toEqual([]);
    expect((await a.call('DELETE', `/api/days-off/${id}`)).status).toBe(404);
  });

  it('ผู้ใช้อื่นเห็น/แก้/ลบของเราไม่ได้ และบันทึกวันเดียวกันได้แยกกัน', async () => {
    const id = (await add(a, { from: '2026-11-12', note: 'ของ A' })).json.daysOff[0].id;
    expect((await list(b)).json.daysOff).toEqual([]);
    expect((await b.call('PATCH', `/api/days-off/${id}`, { note: 'แฮ็ก' })).status).toBe(404);
    expect((await b.call('DELETE', `/api/days-off/${id}`)).status).toBe(404);
    await add(b, { from: '2026-11-12', note: 'ของ B' });
    expect((await list(a)).json.daysOff[0].note).toBe('ของ A');
    expect((await list(b)).json.daysOff[0].note).toBe('ของ B');
  });

  it('dashboard บอกวันหยุดใน 7 วันข้างหน้า (ไม่รวมนอกช่วง/ของคนอื่น); cockpit บอกว่าวันนี้หยุด', async () => {
    await add(a, { from: '2026-11-12' }); // วันนี้
    await add(a, { from: '2026-11-17' }); // +5
    await add(a, { from: '2026-11-20' }); // +8 นอกช่วง
    await add(b, { from: '2026-11-13' });
    const d = (await a.call('GET', '/api/dashboard')).json;
    expect(d.daysOff).toEqual(['2026-11-12', '2026-11-17']);
    expect((await a.call('GET', '/api/cockpit')).json.dayOff).toBe(true);
    expect((await b.call('GET', '/api/cockpit')).json.dayOff).toBe(false);
  });

  it('ส่งออก JSON/ICS มีวันหยุด', async () => {
    await add(a, { from: '2026-11-12', kind: 'sick', note: 'ไข้' });
    const json = (await a.call('GET', '/api/export?format=json')).json;
    expect(json.daysOff).toEqual([{ date: '2026-11-12', kind: 'sick', note: 'ไข้' }]);
    const ics = await (await a.raw('GET', '/api/export?format=ics')).text();
    expect(ics).toContain('UID:dayoff-2026-11-12@dobby');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261112');
    expect(ics).toContain('ลาป่วย');
    expect(await (await b.raw('GET', '/api/export?format=ics')).text()).not.toContain('dayoff-');
  });

  it('ลบบัญชีลบวันหยุดด้วย', async () => {
    await add(a, { from: '2026-11-12' });
    expect((await a.call('DELETE', '/api/account', { confirm: 'a@x.com' })).status).toBe(200);
    const n = await env.DB.prepare('select count(*) as c from days_off').first<{ c: number }>();
    expect(n!.c).toBe(0);
  });
});

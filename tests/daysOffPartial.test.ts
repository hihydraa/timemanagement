import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dayFraction, offDuration } from '../src/lib/daysOff';
import { freezeNow } from '../src/lib/time';
import { Client, makeEnv } from './helpers/app';

let a: Client;
beforeEach(async () => {
  freezeNow(new Date('2026-11-12T10:00:00+07:00'));
  a = new Client(makeEnv());
  await a.login('a@x.com');
});
afterEach(() => freezeNow(null));

const add = (body: object) => a.call('POST', '/api/days-off', body);

describe('วันหยุดบางชั่วโมง (ครึ่งวัน)', () => {
  it('ตัวช่วย: สัดส่วนวันและข้อความ', () => {
    expect(dayFraction(0)).toBe(1);
    expect(dayFraction(240)).toBe(0.5);
    expect(dayFraction(120)).toBe(0.5); // อย่างน้อยครึ่งวัน
    expect(dayFraction(360)).toBe(1); // 6 ชม. ≈ 0.75 → ปัดเป็น 1
    expect(offDuration(0)).toBe('');
    expect(offDuration(240)).toBe('ครึ่งวัน (4 ชม.)');
    expect(offDuration(90)).toBe('1.5 ชม.');
    expect(offDuration(180)).toBe('3 ชม.');
  });

  it('บันทึกเป็นชั่วโมงได้เฉพาะวันเดียว และเก็บเป็นนาที', async () => {
    const r = await add({ from: '2026-11-12', hours: 4, kind: 'personal' });
    expect(r.status).toBe(201);
    const l = (await a.call('GET', '/api/days-off?from=2026-11-01&to=2026-11-30')).json;
    expect(l.daysOff[0]).toMatchObject({ date: '2026-11-12', minutes: 240, kind: 'personal' });
    expect(l.summary.total).toBe(0.5); // ครึ่งวัน
    // ช่วงหลายวันระบุชั่วโมงไม่ได้
    expect((await add({ from: '2026-11-13', to: '2026-11-14', hours: 4 })).status).toBe(400);
    // ค่าผิด
    expect((await add({ from: '2026-11-15', hours: 0 })).status).toBe(400);
    expect((await add({ from: '2026-11-15', hours: 13 })).status).toBe(400);
    expect((await add({ from: '2026-11-15', hours: 2.3 })).status).toBe(400);
  });

  it('วันหยุดครึ่งวันยังเป็นวันทำงาน: cockpit บอกนาทีที่หยุด แต่ dayOff = false', async () => {
    await add({ from: '2026-11-12', hours: 4 });
    const c = (await a.call('GET', '/api/cockpit')).json;
    expect(c.dayOff).toBe(false);
    expect(c.dayOffMinutes).toBe(240);
  });

  it('แดชบอร์ดส่ง partialOff และไม่ใส่ใน daysOff (หยุดเต็มวัน)', async () => {
    await add({ from: '2026-11-12', hours: 3 });
    await add({ from: '2026-11-13' });
    const d = (await a.call('GET', '/api/dashboard')).json;
    expect(d.partialOff).toEqual({ '2026-11-12': 180 });
    expect(d.daysOff).toEqual(['2026-11-13']);
  });

  it('แก้เป็นเต็มวัน/เปลี่ยนชั่วโมงได้ และบันทึกซ้ำวันเดิมเขียนทับ', async () => {
    await add({ from: '2026-11-12', hours: 4 });
    const id = (await a.call('GET', '/api/days-off?from=2026-11-12&to=2026-11-12')).json.daysOff[0]
      .id;
    const p1 = await a.call('PATCH', `/api/days-off/${id}`, { hours: 2 });
    expect(p1.json.dayOff.minutes).toBe(120);
    const p2 = await a.call('PATCH', `/api/days-off/${id}`, { hours: null });
    expect(p2.json.dayOff.minutes).toBe(0);
    await add({ from: '2026-11-12', hours: 5 });
    const l = (await a.call('GET', '/api/days-off?from=2026-11-12&to=2026-11-12')).json;
    expect(l.daysOff).toHaveLength(1);
    expect(l.daysOff[0].minutes).toBe(300);
  });
});

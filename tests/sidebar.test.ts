import { beforeEach, describe, expect, it } from 'vitest';
import { Client, makeEnv } from './helpers/app';

let a: Client;
let b: Client;
beforeEach(async () => {
  const env = makeEnv();
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
});

describe('ตั้งค่าแถบด้านข้างต่อบัญชี', () => {
  it('ค่าเริ่มต้นแสดงเฉพาะที่สำคัญ: ปฏิทินย่อ, ค้นหา, ประเภท, ความเร่งด่วน', async () => {
    const r = await a.call('GET', '/api/settings');
    expect(r.json.sidebarSections).toEqual(['mini', 'search', 'category', 'urgency']);
  });

  it('บันทึกได้ ลำดับคงที่ ตัดค่าซ้ำ และแยกตามบัญชี', async () => {
    const r = await a.call('PATCH', '/api/settings', {
      sidebarSections: ['legend', 'status', 'search', 'status'],
    });
    expect(r.status).toBe(200);
    expect(r.json.sidebarSections).toEqual(['search', 'status', 'legend']);
    expect((await a.call('GET', '/api/settings')).json.sidebarSections).toEqual([
      'search',
      'status',
      'legend',
    ]);
    expect((await b.call('GET', '/api/settings')).json.sidebarSections).toEqual([
      'mini',
      'search',
      'category',
      'urgency',
    ]);
  });

  it('ซ่อนทั้งหมดได้ (อาร์เรย์ว่าง) และไม่กระทบค่าตั้งอื่น', async () => {
    await a.call('PATCH', '/api/settings', { morningDigestTime: '06:45' });
    const r = await a.call('PATCH', '/api/settings', { sidebarSections: [] });
    expect(r.json.sidebarSections).toEqual([]);
    expect(r.json.settings.morningDigestTime).toBe('06:45');
  });

  it('ปฏิเสธชื่อส่วนที่ไม่รู้จัก', async () => {
    const r = await a.call('PATCH', '/api/settings', { sidebarSections: ['hack'] });
    expect(r.status).toBe(400);
  });
});

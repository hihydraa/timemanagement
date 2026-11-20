import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_SNAPSHOT_CHARS } from '../src/lib/avatar';
import { Client, makeEnv } from './helpers/app';

let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;
beforeEach(async () => {
  env = makeEnv();
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
});

const SNAP = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
const get = (c: Client) => c.call('GET', '/api/avatar');
const put = (c: Client, body: object) => c.call('PUT', '/api/avatar', body);
const count = async () =>
  (await env.DB.prepare('select count(*) as c from avatar_profiles').first<{ c: number }>())!.c;

describe('อวตาร 3D ตามบัญชี', () => {
  it('ต้องล็อกอิน', async () => {
    const anon = new Client(env);
    expect((await get(anon)).status).toBe(401);
    expect((await put(anon, { body: 'female', hair: null, outfit: null })).status).toBe(401);
  });

  it('ยังไม่เคยเลือก = null; บันทึกแล้วอ่านกลับได้ตรงกัน', async () => {
    expect((await get(a)).json).toEqual({ avatar: null });
    const r = await put(a, { body: 'male', hair: 'curly-elf', outfit: null, snapshot: SNAP });
    expect(r.status).toBe(200);
    const want = { body: 'male', hair: 'curly-elf', outfit: null, snapshot: SNAP };
    expect(r.json).toEqual({ avatar: want });
    expect((await get(a)).json).toEqual({ avatar: want });
  });

  it('บันทึกซ้ำ = แทนที่ทั้งแถว (ไม่ส่งภาพ = ไม่มีภาพ) และมีแถวเดียวต่อผู้ใช้', async () => {
    await put(a, { body: 'female', hair: 'bob', outfit: null, snapshot: SNAP });
    await put(a, { body: 'nonbinary', hair: null, outfit: 'ghost-a' });
    expect((await get(a)).json).toEqual({
      avatar: { body: 'nonbinary', hair: null, outfit: 'ghost-a', snapshot: null },
    });
    expect(await count()).toBe(1);
  });

  it('ปฏิเสธข้อมูลที่ไม่ถูกต้อง', async () => {
    const ok = { body: 'female', hair: null, outfit: null };
    expect((await put(a, { ...ok, body: 'robot' })).status).toBe(400);
    expect((await put(a, { ...ok, hair: 'mohawk' })).status).toBe(400);
    expect((await put(a, { ...ok, outfit: 'tuxedo' })).status).toBe(400);
    expect((await put(a, { ...ok, extra: 1 })).status).toBe(400);
    expect(await count()).toBe(0);
  });

  it('เลือกตัวละคร ทรงผม และชุดพร้อมกันได้ (ประกอบแยกชิ้น)', async () => {
    const r = await put(a, { body: 'nonbinary', hair: 'bob', outfit: 'cape-vest-a' });
    expect(r.status).toBe(200);
    expect((await get(a)).json).toEqual({
      avatar: { body: 'nonbinary', hair: 'bob', outfit: 'cape-vest-a', snapshot: null },
    });
  });

  it('ยังรับค่าชุดแบบ B ที่เคยบันทึกไว้ (แสดงเป็นแบบ A)', async () => {
    for (const outfit of ['cape-vest-b', 'ghost-b'])
      expect((await put(a, { body: 'female', hair: null, outfit })).status).toBe(200);
  });

  it('ปฏิเสธภาพที่ไม่ใช่ webp/png base64 หรือใหญ่เกินกำหนด', async () => {
    const ok = { body: 'female', hair: null, outfit: null };
    const svg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    const js = 'javascript:alert(1)';
    const notB64 = 'data:image/webp;base64,<script>';
    const big = `data:image/webp;base64,${'A'.repeat(MAX_SNAPSHOT_CHARS)}`;
    for (const snapshot of [svg, js, notB64, big, 'https://evil.example/x.png'])
      expect((await put(a, { ...ok, snapshot })).status, snapshot.slice(0, 30)).toBe(400);
    expect(await count()).toBe(0);
  });

  it('ผู้ใช้แต่ละคนเห็นและแก้ได้เฉพาะของตัวเอง', async () => {
    await put(a, { body: 'male', hair: 'bob', outfit: null, snapshot: SNAP });
    expect((await get(b)).json).toEqual({ avatar: null });
    await put(b, { body: 'female', hair: null, outfit: 'cape-vest-a' });
    expect((await get(a)).json).toMatchObject({ avatar: { body: 'male', hair: 'bob' } });
    expect((await get(b)).json).toMatchObject({
      avatar: { body: 'female', outfit: 'cape-vest-a' },
    });
    expect(await count()).toBe(2);
  });

  it('ลบบัญชีแล้วลบอวตารของคนนั้นด้วย (ของคนอื่นยังอยู่)', async () => {
    await put(a, { body: 'male', hair: null, outfit: null, snapshot: SNAP });
    await put(b, { body: 'female', hair: null, outfit: null });
    expect(await count()).toBe(2);
    expect((await a.call('DELETE', '/api/account', { confirm: 'a@x.com' })).status).toBe(200);
    expect(await count()).toBe(1);
    expect((await get(b)).json).toMatchObject({ avatar: { body: 'female' } });
  });
});

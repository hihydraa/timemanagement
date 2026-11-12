import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CHARACTERS,
  COMPLETE_DAILY_CAP,
  CREATE_DAILY_CAP,
  ITEMS,
  PRICE,
  callName,
  completePoints,
  getItem,
} from '../src/lib/game';
import { freezeNow } from '../src/lib/time';
import { Client, makeEnv } from './helpers/app';

const NOW = new Date('2026-11-12T10:00:00+07:00');
let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;
beforeEach(async () => {
  freezeNow(NOW);
  env = makeEnv();
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
});
afterEach(() => freezeNow(null));

const state = async (c: Client) => (await c.call('GET', '/api/game')).json;
const profile = (c: Client, body: object) => c.call('PUT', '/api/game/profile', body);
const mk = async (c: Client, body: object) => (await c.call('POST', '/api/tasks', body)).json;

describe('แคตาล็อก', () => {
  it('6 ตัวละคร × (10 ชิ้น + 1 สัตว์ประจำตัว) และภาพมีอยู่จริง', async () => {
    const { existsSync } = await import('node:fs');
    expect(CHARACTERS).toHaveLength(6);
    expect(ITEMS).toHaveLength(66);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(66);
    for (const c of CHARACTERS) {
      expect(ITEMS.filter((i) => i.collection === c.id && i.slot !== 'companion')).toHaveLength(10);
      expect(ITEMS.filter((i) => i.collection === c.id && i.slot === 'companion')).toHaveLength(1);
      expect(existsSync(`apps/web/public/game/characters/${c.id}.webp`)).toBe(true);
      expect(existsSync(`apps/web/public/game/companions/${c.id}.webp`)).toBe(true);
    }
    for (const i of ITEMS.filter((x) => x.slot !== 'companion'))
      expect(existsSync(`apps/web/public/game/items/${i.id}.webp`), i.id).toBe(true);
    expect(getItem('harry-pet')!.price).toBe(PRICE.pet);
  });
  it('คำนวณแต้มเสร็จงาน + ชื่อที่ใช้เรียก', () => {
    const t = { importance: 2, dueAt: null, dueDate: null, completedAt: NOW.toISOString() };
    expect(completePoints(t)).toBe(5);
    expect(completePoints({ ...t, importance: 4 })).toBe(8);
    expect(completePoints({ ...t, dueDate: '2026-11-12' })).toBe(7); // ทันภายในสิ้นวัน
    expect(completePoints({ ...t, dueDate: '2026-11-11' })).toBe(5); // เลยกำหนด
    expect(completePoints({ ...t, importance: 3, dueAt: '2026-11-12T08:00:00.000Z' })).toBe(10);
    expect(callName(null)).toBeNull();
    expect(callName({ displayName: 'ก้อง', honorific: 'name' })).toBe('ก้อง');
    expect(callName({ displayName: 'ก้อง', honorific: 'master' })).toBe('นายท่าน');
    expect(callName({ displayName: 'ก้อง', honorific: 'both' })).toBe('นายท่านก้อง');
    expect(callName({ displayName: '', honorific: 'name' })).toBe('นายท่าน');
  });
});

describe('ตัวละคร', () => {
  it('ยังไม่มี → profile null; สร้างแล้วได้แต้มต้อนรับครั้งเดียว; แก้ได้โดยไม่ได้แต้มซ้ำ', async () => {
    expect((await state(a)).profile).toBeNull();
    const r = await profile(a, { characterId: 'hermione', displayName: 'ก้อง', honorific: 'both' });
    expect(r.json).toMatchObject({
      profile: { characterId: 'hermione', displayName: 'ก้อง', honorific: 'both' },
      balance: 30,
    });
    const r2 = await profile(a, { characterId: 'ron', displayName: 'ก้อง2', honorific: 'name' });
    expect(r2.json).toMatchObject({
      profile: { characterId: 'ron', displayName: 'ก้อง2' },
      balance: 30,
    });
    expect((await state(b)).profile).toBeNull();
  });
  it('ตรวจอินพุต: ตัวละครไม่มี/ชื่อว่างเมื่อไม่ใช่ "นายท่าน"/ฟิลด์แปลก/ชื่อยาวเกิน', async () => {
    expect(
      (await profile(a, { characterId: 'voldemort', displayName: 'x', honorific: 'name' })).status,
    ).toBe(400);
    expect(
      (await profile(a, { characterId: 'harry', displayName: '', honorific: 'name' })).status,
    ).toBe(400);
    expect(
      (await profile(a, { characterId: 'harry', displayName: '', honorific: 'master' })).status,
    ).toBe(200);
    expect(
      (await profile(a, { characterId: 'harry', displayName: 'x'.repeat(31), honorific: 'name' }))
        .status,
    ).toBe(400);
    expect(
      (
        await profile(a, {
          characterId: 'harry',
          displayName: 'x',
          honorific: 'name',
          balance: 999,
        })
      ).status,
    ).toBe(400);
    expect((await new Client(env).call('GET', '/api/game')).status).toBe(401);
  });
});

describe('การได้แต้ม', () => {
  it('สร้างงาน +1, เสร็จงาน +5 (+โบนัสวันละครั้ง +2) และคำตอบแนบ points', async () => {
    const c = await mk(a, { title: 'ก' });
    expect(c.points).toBe(1);
    const d = (await a.call('POST', `/api/tasks/${c.task.id}/complete`)).json;
    expect(d.points).toBe(7); // 5 + โบนัสงานแรกของวัน 2
    const c2 = await mk(a, { title: 'ข', importance: 4 });
    const d2 = (await a.call('POST', `/api/tasks/${c2.task.id}/complete`)).json;
    expect(d2.points).toBe(8); // 5 + 3 (สำคัญ) ไม่มีโบนัสวันซ้ำ
    expect((await state(a)).balance).toBe(1 + 7 + 1 + 8);
  });
  it('เสร็จทันเดดไลน์ได้เพิ่ม; เปิดใหม่แล้วปิดอีกไม่ได้แต้มซ้ำ', async () => {
    const c = await mk(a, { title: 'ก', allDay: true, dueDate: '2026-11-12' });
    const first = (await a.call('POST', `/api/tasks/${c.task.id}/complete`)).json.points;
    expect(first).toBe(5 + 2 + 2);
    await a.call('PATCH', `/api/tasks/${c.task.id}`, { status: 'todo' });
    expect((await a.call('POST', `/api/tasks/${c.task.id}/complete`)).json.points).toBe(0);
  });
  it('เพดานรายวัน: สร้างได้แต้มไม่เกิน 10 งาน/วัน, เสร็จไม่เกิน 30 งาน/วัน; วันถัดไปนับใหม่', async () => {
    const ids: string[] = [];
    for (let i = 0; i < CREATE_DAILY_CAP + 3; i++)
      ids.push((await mk(a, { title: `t${i}` })).task.id);
    expect((await state(a)).balance).toBe(CREATE_DAILY_CAP);
    expect((await mk(a, { title: 'เกิน' })).points).toBe(0);
    freezeNow(new Date('2026-11-13T10:00:00+07:00'));
    expect((await mk(a, { title: 'พรุ่งนี้' })).points).toBe(1);
    expect(COMPLETE_DAILY_CAP).toBe(30);
  });
  it('งานของผู้ใช้อื่น/นำเข้า ไม่ให้แต้ม; แต้มแยกตามบัญชี', async () => {
    await b.call('POST', '/api/import/tasks', { tasks: [{ title: 'นำเข้า', status: 'done' }] });
    expect((await state(b)).balance).toBe(0);
    await mk(a, { title: 'x' });
    expect((await state(b)).balance).toBe(0);
  });
});

describe('ร้านค้า', () => {
  const earn = async (c: Client, n: number) => {
    // ให้ผู้ใช้มีแต้ม ≥ n ผ่านทางที่ใช้ได้จริง: ตัวละคร (30) + งาน
    for (let day = 1; (await state(c)).balance < n && day < 60; day++) {
      freezeNow(new Date(`2026-12-${String(day).padStart(2, '0')}T10:00:00+07:00`));
      for (let i = 0; i < 10; i++) {
        const t = (await mk(c, { title: `d${day}-${i}`, importance: 4 })).task;
        await c.call('POST', `/api/tasks/${t.id}/complete`);
      }
    }
  };
  beforeEach(async () => {
    await profile(a, { characterId: 'harry', displayName: 'ก้อง', honorific: 'name' });
  });
  it('แต้มไม่พอ = 409 และไม่หักแต้ม; พอแล้วซื้อได้ ซื้อซ้ำไม่ได้', async () => {
    const r = await a.call('POST', '/api/game/buy', { itemId: 'harry-01' }); // 90 > 30
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('not_enough_points');
    expect((await state(a)).balance).toBe(30);
  });
  it('ซื้อ → หักแต้ม + เข้าคลัง; ซื้อซ้ำ = 409 already_owned; ไอเท็มไม่มี = 404', async () => {
    await earn(a, 200);
    const before = (await state(a)).balance;
    const r = await a.call('POST', '/api/game/buy', { itemId: 'harry-01' });
    expect(r.status).toBe(200);
    expect(r.json.balance).toBe(before - 90);
    expect(r.json.inventory).toEqual([{ itemId: 'harry-01', equipped: false }]);
    const dup = await a.call('POST', '/api/game/buy', { itemId: 'harry-01' });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe('already_owned');
    expect((await state(a)).balance).toBe(before - 90);
    expect((await a.call('POST', '/api/game/buy', { itemId: 'nope' })).status).toBe(404);
    expect((await a.call('POST', '/api/game/buy', { itemId: 'harry-02', price: 0 })).status).toBe(
      400,
    );
  });
  it('ซื้อชุดของตัวละครอื่น/สัตว์ประจำตัวได้ (แต้มพอ) และผู้ใช้อื่นไม่เห็นของเรา', async () => {
    await earn(a, 600);
    expect((await a.call('POST', '/api/game/buy', { itemId: 'hagrid-01' })).status).toBe(200);
    expect((await a.call('POST', '/api/game/buy', { itemId: 'harry-pet' })).status).toBe(200); // 400
    expect((await state(b)).inventory).toEqual([]);
  });
  it('สวม/ถอด: ต้องมีก่อน; ช่องเดียวกันสวมได้ชิ้นเดียว; ถอดได้', async () => {
    await earn(a, 400);
    expect(
      (await a.call('POST', '/api/game/equip', { itemId: 'harry-01', equipped: true })).status,
    ).toBe(409); // ยังไม่มี
    for (const id of ['harry-01', 'dumbledore-07', 'harry-02'])
      await a.call('POST', '/api/game/buy', { itemId: id });
    await a.call('POST', '/api/game/equip', { itemId: 'harry-01', equipped: true });
    await a.call('POST', '/api/game/equip', { itemId: 'harry-02', equipped: true });
    let inv = (await state(a)).inventory as { itemId: string; equipped: boolean }[];
    expect(
      inv
        .filter((i) => i.equipped)
        .map((i) => i.itemId)
        .sort(),
    ).toEqual(['harry-01', 'harry-02']);
    await a.call('POST', '/api/game/equip', { itemId: 'dumbledore-07', equipped: true }); // outer ทับ harry-01
    inv = (await state(a)).inventory;
    expect(
      inv
        .filter((i) => i.equipped)
        .map((i) => i.itemId)
        .sort(),
    ).toEqual(['dumbledore-07', 'harry-02']);
    await a.call('POST', '/api/game/equip', { itemId: 'harry-02', equipped: false });
    expect(
      ((await state(a)).inventory as { equipped: boolean }[]).filter((i) => i.equipped),
    ).toHaveLength(1);
    expect(
      (await b.call('POST', '/api/game/equip', { itemId: 'harry-01', equipped: true })).status,
    ).toBe(409);
  });
  it('ลบบัญชีลบข้อมูลเกมด้วย', async () => {
    await a.call('DELETE', '/api/account', { confirm: 'a@x.com' });
    for (const t of ['game_profiles', 'game_ledger', 'game_inventory']) {
      const n = (await env.DB.prepare(`select count(*) n from ${t}`).first()) as { n: number };
      expect(Number(n.n), t).toBe(0);
    }
  });
});

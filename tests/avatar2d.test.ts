import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AVATAR_ITEMS,
  DEFAULT_LOOK,
  HAIR_COLORS,
  SLOTS,
  renderAvatarSvg,
  validateLook,
  type AvatarLook,
} from '../src/lib/avatar2d';
import { getItem } from '../src/lib/game';
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

const get = (c: Client) => c.call('GET', '/api/avatar2d');
const putLook = (c: Client, look: object) => c.call('PUT', '/api/avatar2d/look', look);
const buy = (c: Client, itemId: string) => c.call('POST', '/api/avatar2d/buy', { itemId });
const give = (uid: string, points: number) =>
  env.DB.prepare(
    `insert into game_ledger (id, user_id, kind, ref, points, created_at) values (?, ?, 'welcome', ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), uid, `t-${crypto.randomUUID()}`, points, '2026-11-24T00:00:00Z')
    .run();
const uidOf = async (email: string) =>
  (await env.DB.prepare('select id from users where email = ?')
    .bind(email)
    .first<{ id: string }>())!.id;

const free = (slot: 'hair' | 'outfit') =>
  AVATAR_ITEMS.filter((i) => i.slot === slot && i.price === 0);
const paid = (slot: 'hair' | 'outfit') =>
  AVATAR_ITEMS.filter((i) => i.slot === slot && i.price > 0);
const look = (
  items: AvatarLook['items'] = {},
  hairColor: AvatarLook['hairColor'] = 'pink',
): AvatarLook => ({
  hairColor,
  items: { outfit: free('outfit')[0]!.id, ...items },
});

describe('แคตาล็อกตัวละคร 2D (ภาพของผู้ใช้)', () => {
  it('รหัสไม่ซ้ำ ช่องถูกต้อง ราคาไม่ติดลบ และอยู่ในแคตาล็อกเกม (ซื้อด้วยบัญชีแต้มเดียวกัน)', () => {
    const ids = AVATAR_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of AVATAR_ITEMS) {
      expect(SLOTS).toContain(i.slot);
      expect(i.price).toBeGreaterThanOrEqual(0);
      expect(getItem(i.id)?.price).toBe(i.price);
    }
  });

  it('ไฟล์ภาพของทุกไอเท็มมีอยู่จริงในโฟลเดอร์ public (ซิงก์กับ export.py)', () => {
    for (const i of AVATAR_ITEMS)
      expect(existsSync(`apps/web/public/avatar2d/${i.file}`), i.file).toBe(true);
  });

  it('มีของฟรีเริ่มต้นทั้งชุดและทรงผม และ DEFAULT_LOOK ใช้ของฟรีล้วน', () => {
    expect(free('outfit').length).toBeGreaterThan(0);
    expect(free('hair').length).toBeGreaterThan(0);
    expect(validateLook(DEFAULT_LOOK)).toBeNull();
    for (const id of Object.values(DEFAULT_LOOK.items))
      expect(AVATAR_ITEMS.find((i) => i.id === id)?.price).toBe(0);
  });

  it('ชุดบังคับ ผมเว้นว่างได้; ไอเท็มผิดช่อง/ไม่มีอยู่ ไม่ผ่าน', () => {
    expect(validateLook({ hairColor: 'natural', items: {} })).toMatch(/ชุด/);
    expect(validateLook(look())).toBeNull();
    expect(validateLook(look({ hair: free('outfit')[0]!.id }))).toMatch(/ไม่ใช่ของช่อง/);
    expect(validateLook(look({ hair: 'a-nope' }))).toMatch(/ไม่พบ/);
  });

  it('วาด SVG ได้ทุกไอเท็ม/สีผม: ชุดอยู่ชั้นล่าง ผมทับบน และไม่มี undefined/NaN', () => {
    for (const c of HAIR_COLORS) {
      const svg = renderAvatarSvg({ ...DEFAULT_LOOK, hairColor: c.id });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).not.toMatch(/undefined|NaN/);
      expect(svg.indexOf('/avatar2d/outfit/')).toBeLessThan(svg.indexOf('/avatar2d/hair/'));
    }
    for (const i of AVATAR_ITEMS) {
      const svg = renderAvatarSvg(look({ [i.slot]: i.id }));
      expect(svg).toContain(`/avatar2d/${i.file}`);
    }
  });

  it('สีผม: natural ไม่มีฟิลเตอร์, สีอื่นใส่ฟิลเตอร์ที่ผม (ไม่ใช่ที่ชุด); ไม่มีผม = ไม่มีฟิลเตอร์', () => {
    const base = DEFAULT_LOOK.items;
    expect(renderAvatarSvg({ hairColor: 'natural', items: base })).not.toContain('<filter');
    const pink = renderAvatarSvg({ hairColor: 'pink', items: base });
    expect(pink).toContain('<filter id="hc-pink"');
    const hairImg = pink.slice(pink.indexOf('/avatar2d/hair/'));
    expect(hairImg.split('/>')[0]).toContain('filter="url(#hc-pink)"');
    const outfitImg = pink.slice(pink.indexOf('/avatar2d/outfit/')).split('/>')[0]!;
    expect(outfitImg).not.toContain('filter=');
    const bald = renderAvatarSvg({ hairColor: 'pink', items: { outfit: base.outfit } });
    expect(bald).not.toContain('<filter');
    expect(bald).not.toContain('/avatar2d/hair/');
  });

  it('กรอบซูมรับเฉพาะตัวเลข (กันสตริงแปลกใน innerHTML)', () => {
    const ok = renderAvatarSvg(DEFAULT_LOOK, { viewBox: '50 0 300 290' });
    expect(ok).toContain('viewBox="50 0 300 290"');
    const bad = renderAvatarSvg(DEFAULT_LOOK, { viewBox: '0 0 1 1" onload="x' });
    expect(bad).toContain('viewBox="0 0 400 490"');
    expect(bad).not.toContain('onload');
  });

  it('ชื่อไฟล์แปลก ๆ ไม่ถูกใส่ลง SVG', () => {
    const item = AVATAR_ITEMS.find((i) => i.slot === 'hair')!;
    const orig = item.file;
    try {
      (item as { file: string }).file = '"><script>x</script>.png';
      expect(renderAvatarSvg(look({ hair: item.id }))).not.toContain('script');
    } finally {
      (item as { file: string }).file = orig;
    }
  });
});

describe('API ตัวละคร 2D', () => {
  it('ต้องล็อกอิน', async () => {
    const anon = new Client(env);
    expect((await get(anon)).status).toBe(401);
    expect((await putLook(anon, look())).status).toBe(401);
    expect((await buy(anon, paid('hair')[0]!.id)).status).toBe(401);
  });

  it('ยังไม่บันทึก = look เป็น null; ของฟรีเป็นของผู้ใช้ทุกคนตั้งแต่แรก; ไม่มีแต้ม', async () => {
    const j = (await get(a)).json;
    expect(j.look).toBeNull();
    expect(j.balance).toBe(0);
    for (const i of free('hair')) expect(j.owned).toContain(i.id);
    expect(j.owned).not.toContain(paid('outfit')[0]!.id);
  });

  it('บันทึกของฟรีได้และอ่านกลับตรงกัน; ผมเว้นว่างได้', async () => {
    const want = look({ hair: free('hair')[0]!.id });
    const r = await putLook(a, want);
    expect(r.status).toBe(200);
    expect(r.json.look).toEqual(want);
    expect((await get(a)).json.look).toEqual(want);
    const bald = look();
    expect((await putLook(a, bald)).json.look).toEqual(bald);
  });

  it('ใส่ของที่ยังไม่ซื้อไม่ได้ (409) และไม่เปลี่ยนค่าเดิม', async () => {
    const mine = look({ hair: free('hair')[0]!.id });
    await putLook(a, mine);
    const r = await putLook(a, look({ hair: paid('hair')[0]!.id }));
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('not_owned');
    expect((await get(a)).json.look).toEqual(mine);
  });

  it('ข้อมูลผิดรูปแบบ → 400: ไม่มีชุด, สีไม่รู้จัก, ไอเท็มไม่มี/ผิดช่อง, ช่องแปลก, ฟิลด์เกิน', async () => {
    expect((await putLook(a, { hairColor: 'natural', items: {} })).status).toBe(400);
    expect((await putLook(a, { ...look(), hairColor: 'neon' })).status).toBe(400);
    expect((await putLook(a, look({ hair: 'a-nope' }))).status).toBe(400);
    expect((await putLook(a, look({ hair: free('outfit')[0]!.id }))).status).toBe(400);
    expect((await putLook(a, look({ cape: 'a-hair-f-bob' } as never))).status).toBe(400);
    expect((await putLook(a, { ...look(), skin: 'light' })).status).toBe(400);
  });

  it('ซื้อด้วยแต้ม: หักแต้ม ได้ของ ใส่ได้; ซื้อซ้ำ 409; แต้มไม่พอ 409; ของฟรีไม่ต้องซื้อ', async () => {
    const uid = await uidOf('a@x.com');
    const cheap = paid('hair').sort((x, y) => x.price - y.price)[0]!;
    const dear = paid('outfit').sort((x, y) => y.price - x.price)[0]!;
    expect((await buy(a, cheap.id)).json.error.code).toBe('not_enough_points');
    await give(uid, cheap.price + 5);
    const r = await buy(a, cheap.id);
    expect(r.status).toBe(200);
    expect(r.json.balance).toBe(5);
    expect(r.json.owned).toContain(cheap.id);
    expect((await buy(a, cheap.id)).json.error.code).toBe('already_owned');
    expect((await buy(a, free('hair')[0]!.id)).json.error.code).toBe('already_owned');
    expect((await buy(a, dear.id)).json.error.code).toBe('not_enough_points');
    expect((await buy(a, 'a-zzz')).status).toBe(404);
    expect((await putLook(a, look({ hair: cheap.id }))).status).toBe(200);
  });

  it('ของที่ซื้อเป็นของบัญชีนั้นเท่านั้น (B ใส่ของที่ A ซื้อไม่ได้) และข้อมูลแยกบัญชี', async () => {
    const item = paid('hair')[0]!;
    await give(await uidOf('a@x.com'), 500);
    await buy(a, item.id);
    await putLook(a, look({ hair: item.id }));
    expect((await putLook(b, look({ hair: item.id }))).status).toBe(409);
    expect((await get(b)).json.look).toBeNull();
    expect((await get(b)).json.owned).not.toContain(item.id);
  });

  it('ค่าที่บันทึกในฐานข้อมูลเสียหรือเป็นรูปแบบเก่า → look เป็น null (ไม่ล้ม)', async () => {
    await putLook(a, look());
    await env.DB.prepare('update avatar2d_profiles set look = ?').bind('{not json').run();
    expect((await get(a)).json.look).toBeNull();
    await env.DB.prepare('update avatar2d_profiles set look = ?')
      .bind(JSON.stringify({ skin: 'light', hairColor: 'brown', items: { hair: 'a-hair-short' } }))
      .run();
    expect((await get(a)).json.look).toBeNull();
  });

  it('ลบบัญชีลบตัวละคร 2D ด้วย', async () => {
    await putLook(a, look());
    const c = await a.call('DELETE', '/api/account', { confirm: 'a@x.com' });
    expect(c.status).toBe(200);
    const n = await env.DB.prepare('select count(*) as c from avatar2d_profiles').first<{
      c: number;
    }>();
    expect(n!.c).toBe(0);
  });
});

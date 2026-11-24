import { beforeEach, describe, expect, it } from 'vitest';
import {
  AVATAR_ITEMS,
  DEFAULT_LOOK,
  HAIR_COLORS,
  SKINS,
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
const look = (items: AvatarLook['items'] = {}): AvatarLook => ({
  skin: 'tan',
  hairColor: 'pink',
  items,
});

describe('แคตาล็อกตัวละคร 2D', () => {
  it('รหัสไม่ซ้ำ ช่องถูกต้อง ราคาไม่ติดลบ และอยู่ในแคตาล็อกเกม (ซื้อด้วยบัญชีแต้มเดียวกัน)', () => {
    const ids = AVATAR_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of AVATAR_ITEMS) {
      expect(SLOTS).toContain(i.slot);
      expect(i.price).toBeGreaterThanOrEqual(0);
      expect(getItem(i.id)?.price).toBe(i.price);
    }
  });

  it('ทุกช่องมีของฟรีหรือเว้นว่างได้ และ DEFAULT_LOOK ใช้ของฟรีล้วน', () => {
    expect(validateLook(DEFAULT_LOOK)).toBeNull();
    for (const id of Object.values(DEFAULT_LOOK.items))
      expect(AVATAR_ITEMS.find((i) => i.id === id)?.price).toBe(0);
  });

  it('ทุกไอเท็ม/สีผิว/สีผม วาดเป็น SVG ได้ ไม่มี undefined/NaN และไม่รับสตริงแปลกปลอม', () => {
    for (const i of AVATAR_ITEMS) {
      const svg = renderAvatarSvg({ ...DEFAULT_LOOK, items: { [i.slot]: i.id } });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).not.toMatch(/undefined|NaN/);
      expect(svg.length).toBeGreaterThan(500);
    }
    for (const s of SKINS)
      for (const h of HAIR_COLORS) {
        const svg = renderAvatarSvg({ skin: s.id, hairColor: h.id, items: {} });
        expect(svg).toContain(s.color);
      }
  });

  it('ชุดเต็มตัวซ่อนเสื้อ/กางเกงตอนแสดง', () => {
    const base = { ...DEFAULT_LOOK.items };
    const noOutfit = renderAvatarSvg({ ...DEFAULT_LOOK, items: base });
    const withOutfit = renderAvatarSvg({
      ...DEFAULT_LOOK,
      items: { ...base, outfit: 'a-outfit-ghost' },
    });
    expect(noOutfit).toContain('#5b86c0'); // กางเกงยีนส์
    expect(withOutfit).not.toContain('#5b86c0');
    expect(withOutfit).toContain('#fbfbfd'); // ผ้าผี
  });

  it('กรอบซูมรับเฉพาะตัวเลข (กันสตริงแปลกใน innerHTML)', () => {
    const ok = renderAvatarSvg(DEFAULT_LOOK, { viewBox: '30 0 240 230' });
    expect(ok).toContain('viewBox="30 0 240 230"');
    const bad = renderAvatarSvg(DEFAULT_LOOK, { viewBox: '0 0 1 1" onload="x' });
    expect(bad).toContain('viewBox="0 0 300 420"');
    expect(bad).not.toContain('onload');
  });

  it('ภาพแบบไฟล์ (image) รับเฉพาะ path ปลอดภัย', () => {
    const item = AVATAR_ITEMS.find((i) => i.id === 'a-hair-bob')!;
    const orig = item.art;
    try {
      (item as { art: unknown }).art = {
        kind: 'image',
        file: 'hair/bob.png',
        back: 'hair/bob-back.png',
      };
      const ok = renderAvatarSvg({ ...DEFAULT_LOOK, items: { hair: 'a-hair-bob' } });
      expect(ok).toContain('href="/avatar2d/hair/bob.png"');
      expect(ok).toContain('href="/avatar2d/hair/bob-back.png"');
      (item as { art: unknown }).art = { kind: 'image', file: '"><script>x</script>.png' };
      const bad = renderAvatarSvg({ ...DEFAULT_LOOK, items: { hair: 'a-hair-bob' } });
      expect(bad).not.toContain('script');
    } finally {
      (item as { art: unknown }).art = orig;
    }
  });
});

describe('API ตัวละคร 2D', () => {
  it('ต้องล็อกอิน', async () => {
    const anon = new Client(env);
    expect((await get(anon)).status).toBe(401);
    expect((await putLook(anon, look())).status).toBe(401);
    expect((await buy(anon, 'a-hair-long')).status).toBe(401);
  });

  it('ยังไม่บันทึก = look เป็น null; ของฟรีเป็นของผู้ใช้ทุกคนตั้งแต่แรก; ไม่มีแต้ม', async () => {
    const j = (await get(a)).json;
    expect(j.look).toBeNull();
    expect(j.balance).toBe(0);
    expect(j.owned).toContain('a-hair-short');
    expect(j.owned).not.toContain('a-hat-crown');
  });

  it('บันทึกของฟรีได้และอ่านกลับตรงกัน', async () => {
    const want = look({ hair: 'a-hair-bob', top: 'a-top-tee-white' });
    const r = await putLook(a, want);
    expect(r.status).toBe(200);
    expect(r.json.look).toEqual(want);
    expect((await get(a)).json.look).toEqual(want);
  });

  it('ใส่ของที่ยังไม่ซื้อไม่ได้ (409) และไม่เปลี่ยนค่าเดิม', async () => {
    await putLook(a, look({ hair: 'a-hair-bob' }));
    const r = await putLook(a, look({ hair: 'a-hair-bob', hat: 'a-hat-crown' }));
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('not_owned');
    expect((await get(a)).json.look.items).toEqual({ hair: 'a-hair-bob' });
  });

  it('ข้อมูลผิดรูปแบบ → 400: สีไม่รู้จัก, ไอเท็มไม่มี, ไอเท็มผิดช่อง, ช่องแปลก', async () => {
    expect((await putLook(a, { ...look(), skin: 'neon' })).status).toBe(400);
    expect((await putLook(a, look({ hair: 'a-nope' }))).status).toBe(400);
    expect((await putLook(a, look({ hair: 'a-top-tee-white' }))).status).toBe(400);
    expect((await putLook(a, look({ cape: 'a-hair-bob' } as never))).status).toBe(400);
    expect((await putLook(a, { ...look(), extra: 1 })).status).toBe(400);
  });

  it('ซื้อด้วยแต้ม: หักแต้ม ได้ของ ใส่ได้; ซื้อซ้ำ 409; แต้มไม่พอ 409; ของฟรีไม่ต้องซื้อ', async () => {
    const uid = await uidOf('a@x.com');
    expect((await buy(a, 'a-hair-long')).json.error.code).toBe('not_enough_points');
    await give(uid, 50);
    const r = await buy(a, 'a-hair-long'); // 30
    expect(r.status).toBe(200);
    expect(r.json.balance).toBe(20);
    expect(r.json.owned).toContain('a-hair-long');
    expect((await buy(a, 'a-hair-long')).json.error.code).toBe('already_owned');
    expect((await buy(a, 'a-hair-short')).json.error.code).toBe('already_owned'); // ฟรี
    expect((await buy(a, 'a-hat-crown')).json.error.code).toBe('not_enough_points'); // 100 > 20
    expect((await buy(a, 'a-zzz')).status).toBe(404);
    expect((await putLook(a, look({ hair: 'a-hair-long' }))).status).toBe(200);
  });

  it('ของที่ซื้อเป็นของบัญชีนั้นเท่านั้น (B ใส่ของที่ A ซื้อไม่ได้) และข้อมูลแยกบัญชี', async () => {
    await give(await uidOf('a@x.com'), 100);
    await buy(a, 'a-hair-long');
    await putLook(a, look({ hair: 'a-hair-long' }));
    expect((await putLook(b, look({ hair: 'a-hair-long' }))).status).toBe(409);
    expect((await get(b)).json.look).toBeNull();
    expect((await get(b)).json.owned).not.toContain('a-hair-long');
  });

  it('ค่าที่บันทึกในฐานข้อมูลเสียหาย → look เป็น null (ไม่ล้ม)', async () => {
    await putLook(a, look());
    await env.DB.prepare('update avatar2d_profiles set look = ?').bind('{not json').run();
    expect((await get(a)).json.look).toBeNull();
  });

  it('ลบบัญชีลบตัวละคร 2D ด้วย', async () => {
    await putLook(a, look({ hair: 'a-hair-bob' }));
    const c = await a.call('DELETE', '/api/account', { confirm: 'a@x.com' });
    expect(c.status).toBe(200);
    const n = await env.DB.prepare('select count(*) as c from avatar2d_profiles').first<{
      c: number;
    }>();
    expect(n!.c).toBe(0);
  });
});

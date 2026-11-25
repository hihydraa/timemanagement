import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DOBBY_NAME,
  TONE_IDS,
  completeKind,
  dobbyNameOf,
  greetingKind,
  greetingN,
  moodOf,
  poolSize,
  sayDobby,
  type DayState,
  type VoiceKind,
} from '../src/lib/dobbyVoice';
import { Client, makeEnv } from './helpers/app';

const KINDS: VoiceKind[] = [
  'complete',
  'complete_important',
  'complete_first',
  'all_clear',
  'streak',
  'created',
  'greet_morning',
  'greet_afternoon',
  'greet_evening',
  'greet_night',
  'overdue',
  'dayoff',
  'no_profile',
  'level_up',
  'quest_done',
];
const base: DayState = {
  hour: 9,
  open: 4,
  overdue: 0,
  doneToday: 0,
  streak: 0,
  dayOff: false,
  noProfile: false,
};

describe('เสียงของ Dobby', () => {
  it('ทุกโทนมีข้อความครบทุกสถานการณ์ และไม่เหลือตัวแปร {…} ที่ไม่ได้เติม', () => {
    for (const tone of TONE_IDS)
      for (const k of KINDS) {
        const n = poolSize(k, tone);
        expect(n, `${tone}/${k}`).toBeGreaterThan(0);
        for (let i = 0; i < n; i++) {
          const msg = sayDobby(k, { you: 'แฮม', dobby: 'โดโบ', n: 3, level: 5 }, tone, () => i / n);
          expect(msg).not.toMatch(/[{}]/);
          expect(msg.length).toBeGreaterThan(5);
        }
      }
  });

  it('เติมชื่อผู้ใช้/ชื่อ Dobby/ตัวเลข; ไม่ตั้งชื่อ = "คุณ" และ "ดอบบี้"', () => {
    expect(sayDobby('greet_morning', { you: 'แฮม', dobby: 'โดโบ', n: 5 }, 'playful', () => 0)).toBe(
      'อรุณสวัสดิ์ แฮม! วันนี้มี 5 งาน ไปลุยกัน ☀️',
    );
    const anon = sayDobby('complete', {}, 'playful', () => 0);
    expect(anon).toContain('คุณ');
    expect(sayDobby('created', { dobby: '  ' }, 'playful', () => 0)).toContain(DEFAULT_DOBBY_NAME);
    expect(dobbyNameOf(' ลูกชิ้น ')).toBe('ลูกชิ้น');
    expect(dobbyNameOf('')).toBe(DEFAULT_DOBBY_NAME);
  });

  it('ตัวสุ่มสุดขอบ (0 และเกือบ 1) ไม่ทำให้ index เกิน', () => {
    expect(() => sayDobby('complete', {}, 'playful', () => 0.999999)).not.toThrow();
    expect(() => sayDobby('complete', {}, 'playful', () => 1)).not.toThrow();
    expect(() => sayDobby('complete', {}, 'nope' as never, () => 0)).not.toThrow(); // โทนไม่รู้จัก → ค่าเริ่มต้น
  });

  it('ลำดับความสำคัญของคำทักทาย: ยังไม่ตั้งค่า > วันหยุด > ค้าง > เคลียร์หมด > สตรีค > ช่วงเวลา', () => {
    expect(greetingKind({ ...base, noProfile: true, dayOff: true, overdue: 2 })).toBe('no_profile');
    expect(greetingKind({ ...base, dayOff: true, overdue: 2 })).toBe('dayoff');
    expect(greetingKind({ ...base, overdue: 2, streak: 9 })).toBe('overdue');
    expect(greetingKind({ ...base, open: 0, doneToday: 3 })).toBe('all_clear');
    expect(greetingKind({ ...base, streak: 5 })).toBe('streak');
    expect(greetingKind({ ...base, streak: 5, hour: 15 })).toBe('greet_afternoon'); // สตรีคทักเฉพาะช่วงเช้า
    expect(greetingKind({ ...base, hour: 9 })).toBe('greet_morning');
    expect(greetingKind({ ...base, hour: 14 })).toBe('greet_afternoon');
    expect(greetingKind({ ...base, hour: 19 })).toBe('greet_evening');
    expect(greetingKind({ ...base, hour: 23 })).toBe('greet_night');
    expect(greetingKind({ ...base, hour: 3 })).toBe('greet_night');
  });

  it('ตัวเลขในคำทักทาย: ค้าง = จำนวนค้าง, สตรีค = วัน, อื่น ๆ = งานที่เหลือ', () => {
    const s = { ...base, open: 4, overdue: 2, streak: 7 };
    expect(greetingN('overdue', s)).toBe(2);
    expect(greetingN('streak', s)).toBe(7);
    expect(greetingN('greet_morning', s)).toBe(4);
  });

  it('ท่าของ Dobby: ดึก/วันหยุด = พัก, ค้าง = กังวล, เคลียร์หมด = ฉลอง, เช้า = ตื่น', () => {
    expect(moodOf({ ...base, hour: 23 })).toBe('rest');
    expect(moodOf({ ...base, hour: 2 })).toBe('rest');
    expect(moodOf({ ...base, dayOff: true })).toBe('rest');
    expect(moodOf({ ...base, overdue: 1 })).toBe('deadline');
    expect(moodOf({ ...base, open: 0, doneToday: 2 })).toBe('done');
    expect(moodOf({ ...base, hour: 8 })).toBe('morning');
    expect(moodOf({ ...base, hour: 14 })).toBe('hello');
  });

  it('ข้อความฉลองหลังทำเสร็จ: งานสุดท้ายของวัน > งานสำคัญ > งานแรกของวัน > ทั่วไป', () => {
    expect(completeKind({ importance: 4, openAfter: 0, doneToday: 3 })).toBe('all_clear');
    expect(completeKind({ importance: 4, openAfter: 2, doneToday: 3 })).toBe('complete_important');
    expect(completeKind({ importance: 2, openAfter: 2, doneToday: 1 })).toBe('complete_first');
    expect(completeKind({ importance: 2, openAfter: 2, doneToday: 3 })).toBe('complete');
    // ทำงานเดียวของวันแล้วไม่เหลือ ไม่ถือว่า "เคลียร์หมด" (doneToday = 1)
    expect(completeKind({ importance: 2, openAfter: 0, doneToday: 1 })).toBe('complete_first');
  });
});

describe('โปรไฟล์ Dobby (ชื่อเรียก ชื่อ Dobby โทน)', () => {
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
  const put = (c: Client, body: object) => c.call('PUT', '/api/game/profile', body);
  const state = async (c: Client) => (await c.call('GET', '/api/game')).json;

  it('ผู้ใช้ใหม่ไม่มีโปรไฟล์; ตั้งได้โดยไม่ต้องเลือกตัวละครเดิม และได้แต้มต้อนรับครั้งเดียว', async () => {
    expect((await state(a)).profile).toBeNull();
    const r = await put(a, { displayName: 'แฮม', honorific: 'both', dobbyName: 'โดโบ' });
    expect(r.status).toBe(200);
    expect(r.json.profile).toMatchObject({
      displayName: 'แฮม',
      honorific: 'both',
      dobbyName: 'โดโบ',
      tone: 'playful',
      characterId: 'harry',
    });
    expect(r.json.balance).toBe(30);
    await put(a, { displayName: 'แฮม', honorific: 'name', dobbyName: '' });
    expect((await state(a)).balance).toBe(30); // แก้ซ้ำไม่ได้แต้มซ้ำ
  });

  it('แก้โปรไฟล์ที่มีอยู่โดยไม่ส่ง characterId = คงตัวละครเดิม', async () => {
    await put(a, { characterId: 'hermione', displayName: 'ก้อง', honorific: 'name' });
    await put(a, { displayName: 'ก้อง2', honorific: 'name', dobbyName: 'ลูกชิ้น' });
    expect((await state(a)).profile).toMatchObject({
      characterId: 'hermione',
      dobbyName: 'ลูกชิ้น',
    });
  });

  it('ตรวจข้อมูล: โทนไม่รู้จัก/ชื่อ Dobby ยาวเกิน/ต้องมีชื่อเมื่อไม่เลือก "นายท่าน"/ฟิลด์เกิน → 400', async () => {
    expect((await put(a, { displayName: 'x', honorific: 'name', tone: 'angry' })).status).toBe(400);
    expect(
      (await put(a, { displayName: 'x', honorific: 'name', dobbyName: 'ก'.repeat(21) })).status,
    ).toBe(400);
    expect((await put(a, { displayName: '', honorific: 'name' })).status).toBe(400);
    expect((await put(a, { displayName: '', honorific: 'master' })).status).toBe(200);
    expect((await put(a, { displayName: 'x', honorific: 'name', hack: 1 })).status).toBe(400);
  });

  it('โปรไฟล์แยกตามบัญชี และต้องล็อกอิน', async () => {
    await put(a, { displayName: 'A', honorific: 'name', dobbyName: 'ของเอ' });
    expect((await state(b)).profile).toBeNull();
    expect(
      (await new Client(env).call('PUT', '/api/game/profile', { honorific: 'master' })).status,
    ).toBe(401);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BADGES, DAILY_QUESTS, levelOf, questStates, xpForLevel } from '../src/lib/progress';
import { streak } from '../src/services/dashboard';
import { freezeNow } from '../src/lib/time';
import { Client, makeEnv } from './helpers/app';

describe('เลเวล', () => {
  it('เกณฑ์ XP และความคืบหน้า', () => {
    expect([1, 2, 3, 4].map(xpForLevel)).toEqual([0, 40, 120, 240]);
    expect(levelOf(0)).toMatchObject({ level: 1, pct: 0, next: 40 });
    expect(levelOf(39).level).toBe(1);
    expect(levelOf(40)).toMatchObject({ level: 2, pct: 0 });
    expect(levelOf(80)).toMatchObject({ level: 2, pct: 50 });
    expect(levelOf(-5).level).toBe(1);
    expect(levelOf(xpForLevel(10)).title).toBe('ปรมาจารย์เวลา');
  });
});

describe('ภารกิจและตรา', () => {
  it('ความคืบหน้าไม่เกินเป้า และจำว่ารับแล้ว', () => {
    const s = questStates({ create: 0, complete: 9 }, new Set(['complete3']));
    const by = Object.fromEntries(s.map((q) => [q.id, q]));
    expect(by.create1).toMatchObject({ progress: 0, done: false, claimed: false });
    expect(by.complete3).toMatchObject({ progress: 3, done: true, claimed: true });
    expect(by.complete5).toMatchObject({ progress: 5, done: true, claimed: false });
  });
  it('ตรามีรหัสไม่ซ้ำและเงื่อนไขทำงาน', () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    const earned = (s: { totalDone: number; streak: number; level: number }) =>
      BADGES.filter((b) => b.test(s)).map((b) => b.id);
    expect(earned({ totalDone: 0, streak: 0, level: 1 })).toEqual([]);
    expect(earned({ totalDone: 10, streak: 3, level: 5 })).toEqual([
      'first',
      'done10',
      'streak3',
      'lv5',
    ]);
  });
});

describe('สตรีคข้ามวันหยุด', () => {
  const TODAY = '2026-11-12';
  it('วันหยุดไม่ทำให้สตรีคขาด และไม่นับเป็นวัน', () => {
    const done = ['2026-11-12', '2026-11-09']; // 10, 11 หยุด
    expect(streak(done, TODAY)).toBe(1);
    expect(streak(done, TODAY, new Set(['2026-11-10', '2026-11-11']))).toBe(2);
  });
  it('วันนี้เป็นวันหยุดและยังไม่มีงาน → สตรีคเดิมยังอยู่', () => {
    expect(streak(['2026-11-11', '2026-11-10'], TODAY, new Set([TODAY]))).toBe(2);
  });
  it('ไม่มีงานเลยแม้ทุกวันเป็นวันหยุด = 0 (ไม่วนไม่รู้จบ)', () => {
    const off = new Set(
      Array.from({ length: 5000 }, (_, i) =>
        new Date(Date.UTC(2026, 10, 12) - i * 86_400_000).toISOString().slice(0, 10),
      ),
    );
    expect(streak([], TODAY, off)).toBe(0);
  });
});

describe('API ภารกิจ', () => {
  const NOW = new Date('2026-11-12T10:00:00+07:00');
  let a: Client;
  let b: Client;
  beforeEach(async () => {
    freezeNow(NOW);
    const env = makeEnv();
    a = new Client(env);
    b = new Client(env);
    await a.login('a@x.com');
    await b.login('b@x.com');
  });
  afterEach(() => freezeNow(null));
  const progress = async (c: Client) => (await c.call('GET', '/api/game/progress')).json;
  const finish = async (c: Client, n: number) => {
    for (let i = 0; i < n; i++) {
      const t = (
        await c.call('POST', '/api/tasks', {
          title: `งาน${i}`,
          allDay: true,
          dueDate: '2026-11-12',
        })
      ).json.task;
      await c.call('POST', `/api/tasks/${t.id}/complete`);
    }
  };

  it('เริ่มต้นเลเวล 1 ภารกิจยังไม่ครบ รับไม่ได้', async () => {
    const p = await progress(a);
    expect(p.level.level).toBe(1);
    expect(p.quests).toHaveLength(DAILY_QUESTS.length);
    const r = await a.call('POST', '/api/game/quests/claim', { questId: 'complete3' });
    expect(r.status).toBe(409);
  });
  it('ทำครบแล้วรับได้ครั้งเดียว ได้แต้มเข้ายอด และไม่รั่วข้ามผู้ใช้', async () => {
    await finish(a, 3);
    const before = (await a.call('GET', '/api/game')).json.balance;
    const ok = await a.call('POST', '/api/game/quests/claim', { questId: 'complete3' });
    expect(ok.status).toBe(200);
    expect(ok.json.reward).toBe(6);
    expect((await a.call('GET', '/api/game')).json.balance).toBe(before + 6);
    expect((await a.call('POST', '/api/game/quests/claim', { questId: 'complete3' })).status).toBe(
      409,
    );
    expect(
      (await progress(a)).quests.find((q: { id: string }) => q.id === 'complete3').claimed,
    ).toBe(true);
    // ผู้ใช้อื่นไม่ได้อะไร
    expect((await progress(b)).quests.every((q: { claimed: boolean }) => !q.claimed)).toBe(true);
    expect((await b.call('POST', '/api/game/quests/claim', { questId: 'complete3' })).status).toBe(
      409,
    );
  });
  it('ภารกิจที่ไม่มีอยู่ → 404 และตราปลดล็อกตามจำนวนงาน', async () => {
    expect((await a.call('POST', '/api/game/quests/claim', { questId: 'nope' })).status).toBe(404);
    await finish(a, 1);
    const p = await progress(a);
    expect(p.badges.find((x: { id: string }) => x.id === 'first').earned).toBe(true);
    expect(p.streak).toBe(1);
  });
});

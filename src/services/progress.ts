import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { gameLedger, tasks } from '../db/schema';
import { ApiError } from '../lib/http';
import { badgeStates, getQuest, levelOf, questStates } from '../lib/progress';
import { addDays, bangkokDate, fromBangkok, now } from '../lib/time';
import { streak } from './dashboard';
import { daysOffBetween } from './daysOff';
import { balanceOf, countToday } from './game';

const STREAK_LOOKBACK = 400;

/** แต้มสะสมตลอดกาล (XP) = ผลรวมแต้มที่ได้รับ (ไม่หักตอนซื้อของ จึงเลเวลไม่ตกเมื่อใช้แต้ม) */
async function lifetimeXp(db: Db, userId: string): Promise<number> {
  const r = await db
    .select({ n: sql<number>`coalesce(sum(${gameLedger.points}), 0)` })
    .from(gameLedger)
    .where(and(eq(gameLedger.userId, userId), sql`${gameLedger.points} > 0`))
    .get();
  return Number(r?.n ?? 0);
}

async function claimedToday(db: Db, userId: string, today: string): Promise<Set<string>> {
  const rows = await db
    .select({ ref: gameLedger.ref })
    .from(gameLedger)
    .where(and(eq(gameLedger.userId, userId), eq(gameLedger.kind, 'quest')));
  const prefix = `${today}:`;
  return new Set(
    rows.filter((r) => r.ref.startsWith(prefix)).map((r) => r.ref.slice(prefix.length)),
  );
}

/** สตรีคปัจจุบัน: วันหยุดที่บันทึกไว้ไม่ทำให้สตรีคขาด */
export async function currentStreak(db: Db, userId: string, today: string): Promise<number> {
  const since = fromBangkok(addDays(today, -STREAK_LOOKBACK)).toISOString();
  const [rows, off] = await Promise.all([
    db
      .select({ c: tasks.completedAt })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, 'done'), gte(tasks.completedAt, since)))
      .limit(5000),
    daysOffBetween(db, userId, addDays(today, -STREAK_LOOKBACK), today),
  ]);
  const days = rows.filter((x) => x.c).map((x) => bangkokDate(new Date(x.c!)));
  return streak(days, today, new Set(off));
}

export async function getProgress(db: Db, userId: string, at = now()) {
  const today = bangkokDate(at);
  const [xp, created, completed, claimed, st, totalDone] = await Promise.all([
    lifetimeXp(db, userId),
    countToday(db, userId, 'create', at),
    countToday(db, userId, 'complete', at),
    claimedToday(db, userId, today),
    currentStreak(db, userId, today),
    db
      .select({ n: sql<number>`count(*)` })
      .from(gameLedger)
      .where(and(eq(gameLedger.userId, userId), eq(gameLedger.kind, 'complete')))
      .get(),
  ]);
  const level = levelOf(xp);
  return {
    level,
    streak: st,
    quests: questStates({ create: created, complete: completed }, claimed),
    badges: badgeStates({ totalDone: Number(totalDone?.n ?? 0), streak: st, level: level.level }),
  };
}

/** รับรางวัลภารกิจ: ต้องทำครบแล้ว และรับได้ครั้งเดียวต่อวัน (unique user+kind+ref) */
export async function claimQuest(db: Db, userId: string, questId: string, at = now()) {
  const q = getQuest(questId);
  if (!q) throw new ApiError(404, 'not_found', 'ไม่พบภารกิจนี้');
  const today = bangkokDate(at);
  if ((await countToday(db, userId, q.counts, at)) < q.target)
    throw new ApiError(409, 'quest_incomplete', 'ยังทำภารกิจนี้ไม่ครบ');
  const before = levelOf(await lifetimeXp(db, userId)).level;
  const r = await db
    .insert(gameLedger)
    .values({
      id: crypto.randomUUID(),
      userId,
      kind: 'quest',
      ref: `${today}:${q.id}`,
      points: q.reward,
      createdAt: at.toISOString(),
    })
    .onConflictDoNothing()
    .returning({ id: gameLedger.id });
  if (!r.length) throw new ApiError(409, 'already_claimed', 'รับรางวัลภารกิจนี้ไปแล้ว');
  const after = levelOf(await lifetimeXp(db, userId)).level;
  return {
    reward: q.reward,
    balance: await balanceOf(db, userId),
    levelUp: after > before ? after : null,
  };
}

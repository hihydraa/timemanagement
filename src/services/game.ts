import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { gameInventory, gameLedger, gameProfiles } from '../db/schema';
import {
  COMPLETE_DAILY_CAP,
  CREATE_DAILY_CAP,
  CREATE_POINTS,
  DAILY_FIRST_BONUS,
  HONORIFICS,
  WELCOME_POINTS,
  CHARACTERS,
  callName,
  completePoints,
  getItem,
} from '../lib/game';
import { ApiError } from '../lib/http';
import { bangkokDate, fromBangkok, now, nowIso } from '../lib/time';

export const profileInput = z
  .object({
    characterId: z.enum(CHARACTERS.map((c) => c.id) as [string, ...string[]]),
    displayName: z.string().trim().max(30).default(''),
    honorific: z.enum(HONORIFICS as [string, ...string[]]),
  })
  .strict()
  .refine((v) => v.honorific === 'master' || v.displayName.length > 0, {
    message: 'displayName: กรุณาตั้งชื่อ (หรือเลือกให้เรียกว่า "นายท่าน")',
    path: ['displayName'],
  });

const dayStartIso = (at: Date) => fromBangkok(bangkokDate(at)).toISOString();

export async function balanceOf(db: Db, userId: string): Promise<number> {
  const r = await db
    .select({ n: sql<number>`coalesce(sum(${gameLedger.points}), 0)` })
    .from(gameLedger)
    .where(eq(gameLedger.userId, userId))
    .get();
  return Number(r?.n ?? 0);
}

export async function getState(db: Db, userId: string, at = now()) {
  const [profile, balance, today, inv, recent] = await Promise.all([
    db.select().from(gameProfiles).where(eq(gameProfiles.userId, userId)).get(),
    balanceOf(db, userId),
    db
      .select({ n: sql<number>`coalesce(sum(${gameLedger.points}), 0)` })
      .from(gameLedger)
      .where(
        and(
          eq(gameLedger.userId, userId),
          gte(gameLedger.createdAt, dayStartIso(at)),
          sql`${gameLedger.points} > 0`,
        ),
      )
      .get(),
    db.select().from(gameInventory).where(eq(gameInventory.userId, userId)),
    db
      .select({
        kind: gameLedger.kind,
        points: gameLedger.points,
        createdAt: gameLedger.createdAt,
        ref: gameLedger.ref,
      })
      .from(gameLedger)
      .where(eq(gameLedger.userId, userId))
      .orderBy(desc(gameLedger.createdAt))
      .limit(8),
  ]);
  return {
    profile: profile
      ? {
          characterId: profile.characterId,
          displayName: profile.displayName,
          honorific: profile.honorific,
        }
      : null,
    balance,
    todayEarned: Number(today?.n ?? 0),
    inventory: inv.map((i) => ({ itemId: i.itemId, equipped: i.equipped === 1 })),
    recent: recent.map((r) => ({
      kind: r.kind,
      points: r.points,
      at: r.createdAt,
      item: r.kind === 'buy' ? r.ref : null,
    })),
  };
}

/** สร้าง/แก้ตัวละคร (ครั้งแรกได้แต้มต้อนรับ) */
export async function saveProfile(db: Db, userId: string, input: z.infer<typeof profileInput>) {
  const ts = nowIso();
  const cur = await db.select().from(gameProfiles).where(eq(gameProfiles.userId, userId)).get();
  const row = {
    userId,
    characterId: input.characterId,
    displayName: input.honorific === 'master' ? input.displayName : input.displayName,
    honorific: input.honorific as 'name' | 'master' | 'both',
    updatedAt: ts,
  };
  if (cur) await db.update(gameProfiles).set(row).where(eq(gameProfiles.userId, userId));
  else {
    await db.insert(gameProfiles).values({ ...row, createdAt: ts });
    await db
      .insert(gameLedger)
      .values({
        id: crypto.randomUUID(),
        userId,
        kind: 'welcome',
        ref: 'welcome',
        points: WELCOME_POINTS,
        createdAt: ts,
      })
      .onConflictDoNothing();
  }
}

export async function buy(db: Db, userId: string, itemId: string) {
  const item = getItem(itemId);
  if (!item) throw new ApiError(404, 'not_found', 'ไม่พบไอเท็มนี้');
  const owned = await db
    .select()
    .from(gameInventory)
    .where(and(eq(gameInventory.userId, userId), eq(gameInventory.itemId, itemId)))
    .get();
  if (owned) throw new ApiError(409, 'already_owned', 'มีไอเท็มนี้แล้ว');
  const balance = await balanceOf(db, userId);
  if (balance < item.price)
    throw new ApiError(409, 'not_enough_points', `แต้มไม่พอ (ต้องใช้ ${item.price} มี ${balance})`);
  const ts = nowIso();
  let paid = false;
  try {
    // ตรวจแต้มในคำสั่ง SQL เอง (กันซื้อซ้อนพร้อมกันจนแต้มติดลบ); unique(user,kind,ref) กันหักซ้ำ
    const res = (await db.run(
      sql`INSERT INTO game_ledger (id, user_id, kind, ref, points, created_at)
          SELECT ${crypto.randomUUID()}, ${userId}, 'buy', ${itemId}, ${-item.price}, ${ts}
          WHERE (SELECT COALESCE(SUM(points), 0) FROM game_ledger WHERE user_id = ${userId}) >= ${item.price}`,
    )) as unknown as { meta?: { changes?: number } };
    paid = (res.meta?.changes ?? 0) > 0;
  } catch {
    // เคยหักแต้มแล้ว (ledger ซ้ำ) แต่คลังไม่มี = ค้างจากครั้งก่อนที่ล้มกลางทาง → ซ่อมโดยใส่ของให้ ไม่หักซ้ำ
    paid = true;
  }
  if (!paid) throw new ApiError(409, 'not_enough_points', 'แต้มไม่พอ');
  await db
    .insert(gameInventory)
    .values({ userId, itemId, equipped: 0, acquiredAt: ts })
    .onConflictDoNothing();
}

/** สวม/ถอด: ช่องเดียวกัน (เช่น ชุดคลุม, สัตว์ประจำตัว) สวมได้ทีละชิ้น — สวมชิ้นใหม่จะถอดชิ้นเดิมในช่องนั้น */
export async function equip(db: Db, userId: string, itemId: string, on: boolean) {
  const item = getItem(itemId);
  if (!item) throw new ApiError(404, 'not_found', 'ไม่พบไอเท็มนี้');
  const inv = await db.select().from(gameInventory).where(eq(gameInventory.userId, userId));
  if (!inv.some((i) => i.itemId === itemId))
    throw new ApiError(409, 'not_owned', 'ยังไม่มีไอเท็มนี้');
  const sameSlot = inv
    .filter((i) => i.itemId !== itemId && getItem(i.itemId)?.slot === item.slot && i.equipped === 1)
    .map((i) => i.itemId);
  const stmts = [
    ...(on
      ? sameSlot.map((id) =>
          db
            .update(gameInventory)
            .set({ equipped: 0 })
            .where(and(eq(gameInventory.userId, userId), eq(gameInventory.itemId, id))),
        )
      : []),
    db
      .update(gameInventory)
      .set({ equipped: on ? 1 : 0 })
      .where(and(eq(gameInventory.userId, userId), eq(gameInventory.itemId, itemId))),
  ];
  await db.batch(stmts as unknown as [(typeof stmts)[0], ...typeof stmts]);
}

// ---------------------------------------------------------------- ให้แต้ม
const rewards = new WeakMap<object, number>();
/** แต้มที่เพิ่งได้จากการทำรายการที่คืน `obj` (ให้ route แนบในคำตอบ) */
export const rewardOf = (obj: object): number => rewards.get(obj) ?? 0;
export const setReward = (obj: object, points: number) => {
  if (points > 0) rewards.set(obj, points);
};

async function countToday(db: Db, userId: string, kind: 'create' | 'complete', at: Date) {
  const r = await db
    .select({ n: sql<number>`count(*)` })
    .from(gameLedger)
    .where(
      and(
        eq(gameLedger.userId, userId),
        eq(gameLedger.kind, kind),
        gte(gameLedger.createdAt, dayStartIso(at)),
      ),
    )
    .get();
  return Number(r?.n ?? 0);
}

async function grant(
  db: Db,
  userId: string,
  kind: 'create' | 'complete' | 'daily',
  ref: string,
  points: number,
  at: Date,
) {
  const r = await db
    .insert(gameLedger)
    .values({ id: crypto.randomUUID(), userId, kind, ref, points, createdAt: at.toISOString() })
    .onConflictDoNothing()
    .returning({ id: gameLedger.id });
  return r.length ? points : 0; // 0 = เคยได้แล้ว (งานเดิม/วันเดิม)
}

/** สร้างงานใหม่: +1 แต้ม (วันละไม่เกิน 10 งาน). ไม่ให้ error ลามไปกระทบการสร้างงาน */
export async function awardCreate(
  db: Db,
  userId: string,
  taskId: string,
  at = now(),
): Promise<number> {
  try {
    if ((await countToday(db, userId, 'create', at)) >= CREATE_DAILY_CAP) return 0;
    return await grant(db, userId, 'create', taskId, CREATE_POINTS, at);
  } catch {
    return 0;
  }
}

/** ทำงานเสร็จ: 5 (+3 ถ้าสำคัญ, +2 ถ้าทันเดดไลน์) ต่องานครั้งเดียว (เปิดใหม่แล้วปิดอีกไม่ได้เพิ่ม) + โบนัสงานแรกของวัน */
export async function awardComplete(
  db: Db,
  userId: string,
  t: {
    id: string;
    importance: number;
    dueAt: string | null;
    dueDate: string | null;
    completedAt: string;
  },
  at = now(),
): Promise<number> {
  try {
    if ((await countToday(db, userId, 'complete', at)) >= COMPLETE_DAILY_CAP) return 0;
    const base = await grant(db, userId, 'complete', t.id, completePoints(t), at);
    if (!base) return 0;
    const bonus = await grant(db, userId, 'daily', bangkokDate(at), DAILY_FIRST_BONUS, at);
    return base + bonus;
  } catch {
    return 0;
  }
}

/** ชื่อที่ Dobby ใช้เรียกผู้ใช้ในข้อความแจ้งเตือน (null = ยังไม่มีตัวละคร) */
export async function callNameOf(db: Db, userId: string): Promise<string | null> {
  const p = await db.select().from(gameProfiles).where(eq(gameProfiles.userId, userId)).get();
  return callName(p ? { displayName: p.displayName, honorific: p.honorific } : null);
}

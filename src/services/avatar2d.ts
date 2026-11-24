import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { avatar2dProfiles, gameInventory } from '../db/schema';
import {
  AVATAR_ITEMS,
  DEFAULT_LOOK,
  HAIR_COLOR_IDS,
  SLOTS,
  getAvatarItem,
  isFreeItem,
  lookItemIds,
  validateLook,
  type AvatarLook,
} from '../lib/avatar2d';
import { ApiError } from '../lib/http';
import { nowIso } from '../lib/time';
import { balanceOf, buy } from './game';

const itemId = z.string().min(1).max(60);

export const lookInput = z
  .object({
    hairColor: z.enum(HAIR_COLOR_IDS),
    items: z
      .object(
        Object.fromEntries(SLOTS.map((s) => [s, itemId.optional()])) as Record<
          (typeof SLOTS)[number],
          z.ZodOptional<typeof itemId>
        >,
      )
      .strict(),
  })
  .strict();

export const buyInput = z.object({ itemId }).strict();

function parseLook(raw: string): AvatarLook | null {
  try {
    const r = lookInput.safeParse(JSON.parse(raw));
    return r.success && !validateLook(r.data) ? r.data : null;
  } catch {
    return null;
  }
}

/** ไอเท็มที่ผู้ใช้ใช้ได้: ของฟรีทั้งหมด + ที่ซื้อไว้ */
async function ownedIds(db: Db, userId: string): Promise<Set<string>> {
  const inv = await db
    .select({ id: gameInventory.itemId })
    .from(gameInventory)
    .where(eq(gameInventory.userId, userId));
  const owned = new Set(AVATAR_ITEMS.filter((i) => i.price === 0).map((i) => i.id));
  for (const r of inv) if (getAvatarItem(r.id)) owned.add(r.id);
  return owned;
}

/** look = null เมื่อผู้ใช้ยังไม่เคยบันทึก (หน้าเว็บใช้ DEFAULT_LOOK ตอนแก้ แต่ไม่แสดงตัวละครมุมจอจนกว่าจะบันทึก) */
export async function getAvatar2d(db: Db, userId: string) {
  const [row, owned, balance] = await Promise.all([
    db.select().from(avatar2dProfiles).where(eq(avatar2dProfiles.userId, userId)).get(),
    ownedIds(db, userId),
    balanceOf(db, userId),
  ]);
  return {
    look: row ? parseLook(row.look) : null,
    owned: [...owned].sort(),
    balance,
  };
}

export async function saveLook(db: Db, userId: string, look: AvatarLook) {
  const bad = validateLook(look);
  if (bad) throw new ApiError(400, 'invalid_look', bad);
  const owned = await ownedIds(db, userId);
  const missing = lookItemIds(look).find((id) => !owned.has(id));
  if (missing) throw new ApiError(409, 'not_owned', 'ยังไม่มีไอเท็มนี้ (ซื้อด้วยแต้มก่อน)');
  const row = { look: JSON.stringify(look), updatedAt: nowIso() };
  await db
    .insert(avatar2dProfiles)
    .values({ userId, ...row })
    .onConflictDoUpdate({ target: avatar2dProfiles.userId, set: row });
  return getAvatar2d(db, userId);
}

export async function buyAvatarItem(db: Db, userId: string, id: string) {
  if (!getAvatarItem(id)) throw new ApiError(404, 'not_found', 'ไม่พบไอเท็มนี้');
  if (isFreeItem(id)) throw new ApiError(409, 'already_owned', 'ไอเท็มนี้ใช้ได้ฟรีอยู่แล้ว');
  await buy(db, userId, id);
  return getAvatar2d(db, userId);
}

export { DEFAULT_LOOK };

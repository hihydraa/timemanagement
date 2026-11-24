import { and, eq, like } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { avatarProfiles, gameInventory } from '../db/schema';
import {
  avatarItemId,
  avatarItemPrice,
  BODY_IDS,
  HAIR_IDS,
  MAX_SNAPSHOT_CHARS,
  OUTFIT_IDS,
  SNAPSHOT_RE,
} from '../lib/avatar';
import { ApiError } from '../lib/http';
import { nowIso } from '../lib/time';
import { balanceOf, purchase } from './game';

export const avatarInput = z
  .object({
    body: z.enum(BODY_IDS),
    hair: z.enum(HAIR_IDS).nullable(),
    outfit: z.enum(OUTFIT_IDS).nullable(),
    /** ไม่ส่ง/null = ไม่มีภาพนิ่ง (เก็บเฉพาะตัวเลือก) */
    snapshot: z
      .string()
      .max(MAX_SNAPSHOT_CHARS, 'ภาพใหญ่เกินกำหนด')
      .regex(SNAPSHOT_RE, 'ภาพต้องเป็น webp หรือ png แบบ base64')
      .nullable()
      .optional(),
  })
  .strict();

export interface AvatarView {
  body: (typeof BODY_IDS)[number];
  hair: (typeof HAIR_IDS)[number] | null;
  outfit: (typeof OUTFIT_IDS)[number] | null;
  snapshot: string | null;
}

/** null = ผู้ใช้ยังไม่เคยเลือกอวตาร */
export async function getAvatar(db: Db, userId: string): Promise<AvatarView | null> {
  const r = await db.select().from(avatarProfiles).where(eq(avatarProfiles.userId, userId)).get();
  if (!r) return null;
  return {
    body: r.body as AvatarView['body'],
    hair: r.hair as AvatarView['hair'],
    outfit: r.outfit as AvatarView['outfit'],
    snapshot: r.snapshot,
  };
}

/** รหัสที่ปลดล็อกแล้ว เช่น ['hair:bob', 'outfit:ghost-a'] */
export async function ownedAvatarItems(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: gameInventory.itemId })
    .from(gameInventory)
    .where(and(eq(gameInventory.userId, userId), like(gameInventory.itemId, 'av:%')))
    .all();
  return rows.map((r) => r.id.slice(3));
}

export async function avatarShop(db: Db, userId: string) {
  return { owned: await ownedAvatarItems(db, userId), balance: await balanceOf(db, userId) };
}

export async function unlockAvatarItem(
  db: Db,
  userId: string,
  kind: 'hair' | 'outfit',
  id: string,
) {
  const price = avatarItemPrice(kind, id);
  if (price === undefined) throw new ApiError(404, 'not_found', 'ไม่พบรายการนี้');
  await purchase(db, userId, avatarItemId(kind, id), price);
}

export async function saveAvatar(
  db: Db,
  userId: string,
  input: z.infer<typeof avatarInput>,
): Promise<AvatarView> {
  // ทรงผม/ชุดต้องปลดล็อกแล้ว (หรือเป็นค่าที่เคยบันทึกไว้ก่อนมีระบบแต้ม)
  const cur = await getAvatar(db, userId);
  const owned = new Set(await ownedAvatarItems(db, userId));
  const check = (kind: 'hair' | 'outfit', id: string | null) => {
    if (!id || cur?.[kind] === id || owned.has(`${kind}:${id}`)) return;
    throw new ApiError(403, 'locked', 'ยังไม่ได้ปลดล็อกรายการนี้');
  };
  check('hair', input.hair);
  check('outfit', input.outfit);
  const row = {
    body: input.body,
    hair: input.hair,
    outfit: input.outfit,
    snapshot: input.snapshot ?? null,
    updatedAt: nowIso(),
  };
  await db
    .insert(avatarProfiles)
    .values({ userId, ...row })
    .onConflictDoUpdate({ target: avatarProfiles.userId, set: row });
  return { body: row.body, hair: row.hair, outfit: row.outfit, snapshot: row.snapshot };
}

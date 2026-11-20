import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client';
import { avatarProfiles } from '../db/schema';
import { BODY_IDS, HAIR_IDS, MAX_SNAPSHOT_CHARS, OUTFIT_IDS, SNAPSHOT_RE } from '../lib/avatar';
import { nowIso } from '../lib/time';

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
  .strict()
  .refine((v) => !(v.outfit && v.hair), {
    message: 'ชุดเต็มตัวมีหัวของตัวเอง ใช้ร่วมกับทรงผมไม่ได้',
    path: ['hair'],
  });

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

export async function saveAvatar(
  db: Db,
  userId: string,
  input: z.infer<typeof avatarInput>,
): Promise<AvatarView> {
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

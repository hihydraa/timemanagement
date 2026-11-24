/** อวตาร 3D: รหัสตัวละคร/ทรงผม/ชุดที่ใช้ร่วมกันทั้งเซิร์ฟเวอร์และเว็บ (ป้ายชื่อไทยและไฟล์โมเดลอยู่ที่ apps/web/src/lib/avatarModels.ts) */
export const BODY_IDS = ['female', 'male', 'nonbinary'] as const;
export const HAIR_IDS = ['bob', 'curly-elf'] as const;
export const OUTFIT_IDS = ['cape-vest-a', 'cape-vest-b', 'ghost-a', 'ghost-b'] as const;

export type BodyId = (typeof BODY_IDS)[number];
export type HairId = (typeof HAIR_IDS)[number];
export type OutfitId = (typeof OUTFIT_IDS)[number];

/** ภาพนิ่งตัวละคร (data URL ของ webp/png ที่ถ่ายจากโมเดล ~15 KB) เก็บคู่กับตัวเลือกเพื่อให้ขึ้นมุมขวาล่างได้ทุกเครื่อง */
export const MAX_SNAPSHOT_CHARS = 100_000;
export const SNAPSHOT_RE = /^data:image\/(webp|png);base64,[A-Za-z0-9+/]+={0,2}$/;

/** ราคาปลดล็อกด้วยแต้ม (ตัวละครพื้นฐานฟรี) — รหัสในคลัง/สมุดแต้มคือ `av:hair:<id>` และ `av:outfit:<id>` */
export const HAIR_PRICES: Record<HairId, number> = { bob: 40, 'curly-elf': 80 };
export const OUTFIT_PRICES: Record<OutfitId, number> = {
  'cape-vest-a': 120,
  'cape-vest-b': 120,
  'ghost-a': 200,
  'ghost-b': 200,
};
export const avatarItemId = (kind: 'hair' | 'outfit', id: string) => `av:${kind}:${id}`;
export function avatarItemPrice(kind: 'hair' | 'outfit', id: string): number | undefined {
  const table: Record<string, number> = kind === 'hair' ? HAIR_PRICES : OUTFIT_PRICES;
  return table[id];
}

/** แคตาล็อกโมเดล 3D: ตัวละคร / ทรงผม / เสื้อผ้า (ไฟล์อยู่ที่ apps/web/public/models/, ดู character/models/MANIFEST.md) */

import type { BodyId, HairId, OutfitId } from '../../../../src/lib/avatar';

export type { BodyId, HairId, OutfitId };

/** อวตารที่บันทึกในบัญชี (snapshot = ภาพนิ่ง data URL สำหรับมุมขวาล่าง) */
export interface AvatarState {
  body: BodyId;
  hair: HairId | null;
  outfit: OutfitId | null;
  snapshot: string | null;
}

export const BODIES: readonly { id: BodyId; th: string }[] = [
  { id: 'female', th: 'ตัวละครหญิง' },
  { id: 'male', th: 'ตัวละครชาย' },
  { id: 'nonbinary', th: 'ตัวละคร Non-binary' },
];

export const HAIRS: readonly { id: HairId; th: string }[] = [
  { id: 'bob', th: 'ทรงบ็อบ' },
  { id: 'curly-elf', th: 'ผมหยิกหูแหลม' },
];

export const OUTFITS: readonly { id: OutfitId; th: string }[] = [
  { id: 'cape-vest-a', th: 'ชุดคลุมแดง-กั๊ก (แบบ A)' },
  { id: 'cape-vest-b', th: 'ชุดคลุมแดง-กั๊ก (แบบ B)' },
  { id: 'ghost-a', th: 'ชุดผี (แบบ A)' },
  { id: 'ghost-b', th: 'ชุดผี (แบบ B)' },
];

export const bodyUrl = (id: BodyId) => `/models/base/${id}.glb`;
export const hairUrl = (id: HairId) => `/models/hair/hair-${id}.glb`;
export const outfitUrl = (id: OutfitId) => `/models/outfit/outfit-${id}.glb`;

/**
 * จูนตำแหน่งทรงผมบนหัวของแต่ละคู่ตัวละคร-ทรงผม (ปรับด้วยตาจากการเรนเดอร์จริง เหมือน LANDMARKS ของ 2D เดิม)
 * dy = เลื่อนขึ้น/ลง (หน่วยเดียวกับความสูงตัวละคร = 2), s = ขนาดเทียบค่าเริ่มต้น. ไม่ได้ระบุ = {dy:0, s:1}
 */
export const HAIR_FIT: Partial<Record<BodyId, Partial<Record<HairId, { dy: number; s: number }>>>> = {
  male: { 'curly-elf': { dy: 0.1, s: 1 } },
};

export const hairFit = (body: BodyId, hair: HairId) => HAIR_FIT[body]?.[hair] ?? { dy: 0, s: 1 };

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
  { id: 'curly-elf', th: 'ผมหยิก + หน้าเอลฟ์ (เปลี่ยนหน้าด้วย)' },
];

/** ชุดที่เลือกได้ในหน้าอวตาร (แบบ B หน้าตาเหมือน A ทุกอย่างและเป็นชิ้นเดียวแยกส่วนไม่ได้ จึงไม่ให้เลือกแล้ว) */
export const OUTFITS: readonly { id: OutfitId; th: string }[] = [
  { id: 'cape-vest-a', th: 'ชุดคลุมแดง-กั๊ก' },
  { id: 'ghost-a', th: 'ชุดผี' },
];

/** ค่าที่เคยบันทึกไว้ในบัญชี (แบบ B) แสดงเป็นแบบ A ที่หน้าตาเหมือนกัน */
export const LEGACY_OUTFIT: Partial<Record<OutfitId, OutfitId>> = {
  'cape-vest-b': 'cape-vest-a',
  'ghost-b': 'ghost-a',
};
export const resolveOutfit = (id: OutfitId): OutfitId => LEGACY_OUTFIT[id] ?? id;

/**
 * ไฟล์ทรงผม/ชุดแต่ละไฟล์เป็น "ตัวละครทั้งตัวที่แยกเป็นชิ้น" (หัว ผม ลำตัว มือ เท้า ดวงตา เสื้อผ้า ...)
 * จึงต้องเลือกเฉพาะชิ้นที่เป็นผม/เสื้อผ้า (ชื่อ node ในไฟล์) ส่วนที่เหลือเป็นผิวของตัวละครต้นฉบับ ซึ่งใช้ตัวละครที่ผู้ใช้เลือกแทน
 * `replacesHead` = ชิ้นผมมีหน้ารวมอยู่ในชิ้นเดียว (แยกผมออกจากหัวไม่ได้) จึงต้องซ่อนหัวของตัวละครพื้นฐานแล้วใช้หัวนี้แทน
 */
export const HAIR_PARTS: Record<HairId, { parts: readonly string[]; replacesHead: boolean }> = {
  bob: { parts: ['tripo_part_0'], replacesHead: false },
  'curly-elf': { parts: ['tripo_part_0', 'tripo_part_2', 'tripo_part_3'], replacesHead: true },
};

/** ชิ้นที่เป็นเสื้อผ้า (ชุดคลุม เสื้อ กั๊ก กางเกง แขนพอง / ชุดผี) */
export const OUTFIT_PARTS: Record<OutfitId, readonly string[]> = {
  'cape-vest-a': [
    'tripo_part_0',
    'tripo_part_2',
    'tripo_part_3',
    'tripo_part_4',
    'tripo_part_7',
    'tripo_part_8',
  ],
  'ghost-a': ['tripo_part_0'],
  'cape-vest-b': [],
  'ghost-b': [],
};

/** ตัดหัวของตัวละครพื้นฐานที่สูงกว่าระดับนี้ (คอ ≈ y 1.2 ในหน่วยที่ตัวละครสูง 2) เมื่อใช้ผมที่มีหน้ามาด้วย */
export const HEAD_CUT_Y = 1.22;

export const bodyUrl = (id: BodyId) => `/models/base/${id}.glb`;
export const hairUrl = (id: HairId) => `/models/hair/hair-${id}.glb`;
export const outfitUrl = (id: OutfitId) => `/models/outfit/outfit-${resolveOutfit(id)}.glb`;

/**
 * จูนตำแหน่งของผม/เสื้อผ้าบนตัวละครแต่ละแบบ (ปรับด้วยตาจากการเรนเดอร์จริง; หน่วยเดียวกับความสูงตัวละคร = 2)
 * dy = เลื่อนขึ้น/ลง, dz = เลื่อนหน้า/หลัง, sx = ขยายเฉพาะแนวนอน (กันผิวชุดรัดรูปของตัวละครโผล่ทะลุ), s = ขนาดเทียบค่าเริ่มต้น (รอบจุดหมุนระดับหัว). ไม่ได้ระบุ = {dy:0, s:1}
 */
export type Fit = {
  dy: number;
  s: number;
  dz?: number;
  sx?: number;
  /** ขยายเฉพาะความลึก (หน้า-หลัง) */
  sz?: number;
  /** ขยายเฉพาะบางชิ้น (ชื่อ node → ตัวคูณแนวนอน) เช่นกางเกงให้คลุมขาของตัวละครที่ตัวใหญ่กว่า */
  partSx?: Record<string, number>;
};
export const HAIR_FIT: Partial<Record<BodyId, Partial<Record<HairId, Fit>>>> = {
  // หัวใหญ่ขึ้นตามอัตราส่วนความกว้างหัว (หญิง .364 : ชาย .378 : non-binary .414) ผมต้องใหญ่ตาม ไม่งั้นหนังหัวโผล่ทะลุ
  female: { bob: { dy: 0, s: 1.1 } },
  male: { bob: { dy: 0, s: 1.16 } },
  nonbinary: { bob: { dy: -0.03, s: 1.25 } },
};
export const OUTFIT_FIT: Partial<Record<BodyId, Partial<Record<OutfitId, Fit>>>> = {
  female: { 'cape-vest-a': { dy: 0, s: 1, sx: 1.12 } },
  male: { 'cape-vest-a': { dy: 0, s: 1, sx: 1.12 } },
  nonbinary: {
    'cape-vest-a': { dy: 0, s: 1, sx: 1.12, sz: 1.22, partSx: { tripo_part_4: 1.22 } },
    // ลำตัวกว้างกว่าตัวอื่น: ชุดผีขนาดเดิมแคบเกินจนลำตัวโผล่ทะลุที่หน้าอก (ตรวจด้วยการเรนเดอร์หน้าตรง/ข้าง)
    'ghost-a': { dy: 0, s: 1, sx: 1.18, sz: 1.35 },
  },
};

export const hairFit = (body: BodyId, hair: HairId): Fit =>
  HAIR_FIT[body]?.[hair] ?? { dy: 0, s: 1 };
export const outfitFit = (body: BodyId, outfit: OutfitId): Fit =>
  OUTFIT_FIT[body]?.[outfit] ?? { dy: 0, s: 1 };

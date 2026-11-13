import { FIT, getItem, type Slot } from './game';

/**
 * สวมเครื่องแต่งกายซ้อนบนตัวละคร (paper-doll)
 * ตำแหน่งวัดจากภาพอ้างอิงที่แต่งครบชุด (ลำดับการสวมของแฮร์รี่/เฮอร์ไมโอนี่/รอน/ดัมเบิลดอร์) โดยใช้หน่วย "L = ความยาวตัวจากคางถึงเท้า"
 * จึงใช้กับภาพตัวละครสเกลต่างกันได้: จุดอ้างอิงของตัวละคร = (cx = กึ่งกลางลำตัว, chin = คาง/คอเสื้อ, feet = ฝ่าเท้า) เป็นสัดส่วนของภาพตัวละครที่ตัดพื้นแล้ว
 * ตำแหน่งของไอเท็ม: x = กึ่งกลางเทียบ cx (หน่วย L), w = ความกว้าง (หน่วย L),
 *   แบบยืดเต็มช่วง: top/bottom = ระยะลงจากคาง (หน่วย L) — ใช้กับเสื้อผ้า
 *   แบบกึ่งกลาง: y = กึ่งกลางลงจากคาง (หน่วย L), ความสูงตามสัดส่วนภาพ — ใช้กับของถือ/สัตว์/หมวก/จี้
 */
export interface Rig {
  /** ขนาดภาพตัวละคร (px) */
  w: number;
  h: number;
  cx: number;
  chin: number;
  feet: number;
  /** ระยะจากกึ่งกลางถึงมือแต่ละข้าง (หน่วย L) สำหรับถุงมือ */
  handDx: number;
}
export const RIGS: Record<string, Rig> = {
  harry: { w: 290, h: 454, cx: 0.59, chin: 0.55, feet: 0.99, handDx: 0.5 },
  hermione: { w: 408, h: 437, cx: 0.55, chin: 0.56, feet: 0.99, handDx: 0.45 },
  ron: { w: 292, h: 453, cx: 0.575, chin: 0.55, feet: 0.99, handDx: 0.5 },
  dumbledore: { w: 324, h: 458, cx: 0.56, chin: 0.55, feet: 0.99, handDx: 0.5 },
  draco: { w: 256, h: 471, cx: 0.59, chin: 0.5, feet: 0.99, handDx: 0.33 },
  hagrid: { w: 471, h: 506, cx: 0.535, chin: 0.55, feet: 0.99, handDx: 0.85 },
};

export interface Spec {
  x?: number;
  w: number;
  top?: number;
  bottom?: number;
  y?: number;
  rot?: number;
  flip?: boolean;
  /** ถุงมือคู่: ตัดครึ่งซ้าย/ขวาไปวางที่มือแต่ละข้าง */
  pair?: boolean;
  z?: number;
}

/** ตำแหน่งไอเท็มรายชิ้น (id → spec) และสัตว์ประจำตัว (`<ตัวละคร>-pet`) */
export const SPECS: Record<string, Spec> = {
  // ---- แฮร์รี่
  'harry-01': { w: 0.92, top: -0.05, bottom: 0.87 },
  'harry-02': { w: 0.62, top: 0, bottom: 0.55 },
  'harry-03': { w: 0.45, top: 0.05, bottom: 0.5 },
  'harry-04': { w: 0.11, top: 0.08, bottom: 0.32 },
  'harry-05': { w: 0.5, top: 0.5, bottom: 0.78 },
  'harry-06': { x: 0.02, w: 0.66, top: 0.78, bottom: 1.0 },
  'harry-07': { x: -0.04, w: 0.58, top: -0.03, bottom: 0.56 },
  'harry-08': { x: -0.05, w: 0.72, y: -0.36 },
  'harry-09': { x: -0.6, w: 0.35, y: 0.2, flip: true, rot: 10 },
  'harry-10': { x: 0.55, w: 1.1, y: 0.25, rot: -40 },
  'harry-pet': { x: -0.43, w: 0.38, y: -0.01 },
  // ---- เฮอร์ไมโอนี่
  'hermione-01': { w: 0.7, top: -0.05, bottom: 0.84 },
  'hermione-02': { w: 0.55, top: 0, bottom: 0.5 },
  'hermione-03': { w: 0.5, top: 0.08, bottom: 0.52 },
  'hermione-04': { w: 0.1, top: 0.08, bottom: 0.3 },
  'hermione-05': { w: 0.5, top: 0.45, bottom: 0.74 },
  'hermione-06': { w: 0.52, top: 0.83, bottom: 1.0 },
  'hermione-07': { x: -0.03, w: 0.44, top: -0.02, bottom: 0.5 },
  'hermione-08': { x: 0.01, w: 0.2, y: 0.26 },
  'hermione-09': { x: -0.4, w: 0.2, y: 0.63, rot: 180 },
  'hermione-10': { x: 0.3, w: 0.24, y: 0.6 },
  'hermione-pet': { x: 0.39, w: 0.4, y: 0.8 },
  // ---- รอน
  'ron-01': { w: 0.82, top: -0.03, bottom: 0.84 },
  'ron-02': { w: 0.55, top: 0, bottom: 0.55 },
  'ron-03': { w: 0.5, top: 0.05, bottom: 0.58 },
  'ron-04': { w: 0.1, top: 0.03, bottom: 0.27 },
  'ron-05': { w: 0.5, top: 0.38, bottom: 0.97 },
  'ron-06': { w: 0.62, top: 0.87, bottom: 1.0 },
  'ron-07': { x: -0.02, w: 0.55, top: -0.03, bottom: 0.5 },
  'ron-08': { x: -0.02, w: 0.74, y: -1.0 },
  'ron-09': { x: -0.42, w: 0.2, y: 0.65, rot: 180 },
  'ron-10': { x: 0.37, w: 0.26, y: 0.72 },
  'ron-pet': { x: 0.27, w: 0.26, y: 0.05 },
  // ---- ดัมเบิลดอร์
  'dumbledore-01': { w: 0.9, top: 0, bottom: 0.86 },
  'dumbledore-02': { w: 0.55, top: 0.05, bottom: 0.62 },
  'dumbledore-03': { w: 0.42, top: 0.55, bottom: 0.93 },
  'dumbledore-04': { w: 0.62, top: 0.8, bottom: 1.0 },
  'dumbledore-05': { x: -0.04, w: 0.8, top: -1.4, bottom: -0.8 },
  'dumbledore-06': { x: -0.04, w: 0.78, y: -0.62 },
  'dumbledore-07': { w: 0.88, top: 0, bottom: 0.86 },
  'dumbledore-08': { w: 0.38, top: 0.33, bottom: 0.5 },
  'dumbledore-09': { x: 0.56, w: 0.43, y: -0.07, rot: -25 },
  'dumbledore-10': { x: -0.43, w: 0.2, y: 0.46 },
  'dumbledore-pet': { x: 0.78, w: 0.6, y: 0.15 },
  // ---- ดราโก
  'draco-01': { w: 0.9, top: -0.05, bottom: 0.87 },
  'draco-02': { w: 0.6, top: 0, bottom: 0.55 },
  'draco-03': { w: 0.5, top: 0.05, bottom: 0.52 },
  'draco-04': { w: 0.11, top: 0.06, bottom: 0.3 },
  'draco-05': { w: 0.5, top: 0.38, bottom: 0.97 },
  'draco-06': { w: 0.62, top: 0.87, bottom: 1.0 },
  'draco-07': { x: -0.03, w: 0.55, top: -0.03, bottom: 0.52 },
  'draco-08': { w: 0.16, y: 0.55, pair: true },
  'draco-09': { x: -0.42, w: 0.24, y: 0.65, rot: 180 },
  'draco-10': { x: 0.38, w: 0.26, y: 0.66 },
  'draco-pet': { x: 0.33, w: 0.3, y: 0 },
  // ---- แฮกริด
  'hagrid-01': { w: 1.05, top: -0.03, bottom: 0.8 },
  'hagrid-02': { w: 0.85, top: 0, bottom: 0.55 },
  'hagrid-03': { w: 0.8, top: 0.05, bottom: 0.5 },
  'hagrid-04': { w: 0.8, top: 0.5, bottom: 0.92 },
  'hagrid-05': { w: 0.95, top: 0.8, bottom: 1.0 },
  'hagrid-06': { w: 0.85, top: 0.5, bottom: 0.6 },
  'hagrid-07': { w: 0.2, y: 0.4, pair: true },
  'hagrid-08': { w: 0.75, top: -0.03, bottom: 0.45 },
  'hagrid-09': { x: 0.85, w: 0.45, y: 0.35 },
  'hagrid-10': { x: 0.8, w: 0.4, y: 0.55 },
  'hagrid-pet': { x: 0.1, w: 0.8, y: 0.9 },
};

/** ลำดับซ้อน (ล่าง → บน) */
export const Z: Record<Exclude<Slot, 'companion'>, number> = {
  bottom: 1,
  shoes: 2,
  shirt: 2.5,
  top: 3,
  outer: 4,
  waist: 5,
  tie: 5.5,
  neck: 6,
  bag: 7,
  gloves: 8,
  hand: 9,
  carry: 9,
  accessory: 10,
  face: 11,
  head: 12,
};

/** ขอบรอบกรอบตัวละคร (สัดส่วน) ให้หมวก/ไม้/สัตว์ที่ล้นออกนอกตัวยังแสดงครบ */
export const PAD = { x: 0.45, top: 0.3, bottom: 0.12 };
const CW = 1 + 2 * PAD.x;
const CH = 1 + PAD.top + PAD.bottom;

export interface Box {
  /** % ของ canvas: กึ่งกลาง (cx, cy) และความกว้าง; height = undefined → ตามสัดส่วนภาพ */
  cx: number;
  cy: number;
  width: number;
  height?: number;
  z: number;
  rotate?: number;
  flip?: boolean;
  /** ถุงมือคู่: ตัดครึ่งภาพ */
  crop?: 'left' | 'right';
}

function build(charId: string, id: string, z: number): Box[] {
  const r = RIGS[charId];
  const sp = SPECS[id];
  if (!r || !sp) return [];
  const L = r.feet - r.chin; // สัดส่วนความสูงภาพ
  const sx = (L * r.h) / r.w; // 1 หน่วย L เป็นสัดส่วนความกว้างภาพ
  const fx = (dx: number) => ((PAD.x + r.cx + dx * sx) / CW) * 100;
  const fy = (dy: number) => ((PAD.top + r.chin + dy * L) / CH) * 100;
  const wPct = (w: number) => ((w * sx) / CW) * 100;
  const x = sp.x ?? 0;
  const base = { z: sp.z ?? z, rotate: sp.rot, flip: sp.flip };
  if (sp.pair) {
    // ภาพถุงมือเป็นคู่: ตัดครึ่งซ้าย/ขวาไปวางที่มือแต่ละข้าง (ความกว้างของทั้งคู่ = 2 × w)
    return (['left', 'right'] as const).map((crop) => ({
      ...base,
      cx: fx(crop === 'left' ? -r.handDx : r.handDx),
      cy: fy(sp.y ?? 0.45),
      width: wPct(sp.w),
      crop,
    }));
  }
  if (sp.top !== undefined && sp.bottom !== undefined) {
    const top = fy(sp.top);
    const bottom = fy(sp.bottom);
    return [
      { ...base, cx: fx(x), cy: (top + bottom) / 2, width: wPct(sp.w), height: bottom - top },
    ];
  }
  return [{ ...base, cx: fx(x), cy: fy(sp.y ?? 0.4), width: wPct(sp.w) }];
}

/** กล่องของไอเท็มบนตัวละคร (ถุงมือคืน 2 กล่อง) */
export function placeItems(charId: string, itemId: string): Box[] {
  const item = getItem(itemId);
  if (!item || item.slot === 'companion') return [];
  return build(charId, itemId, Z[item.slot]);
}
/** กล่องหลัก (ชิ้นแรก) */
export const placeItem = (charId: string, itemId: string): Box | null =>
  placeItems(charId, itemId)[0] ?? null;

/** สัตว์ประจำตัว (ภาพตัดพื้น `cut/companions`) */
export function placePet(charId: string): Box | null {
  return build(charId, `${charId}-pet`, 13)[0] ?? null;
}

/** อัตราส่วน กว้าง/สูง ของ canvas ตัวละคร */
export const canvasAspect = (charId: string): number => {
  const r = RIGS[charId];
  return r ? (CW * r.w) / (CH * r.h) : 0.7;
};

/** ตำแหน่งกรอบตัวละครใน canvas (%) */
export const FIGURE = {
  left: (PAD.x / CW) * 100,
  top: (PAD.top / CH) * 100,
  width: (1 / CW) * 100,
  height: (1 / CH) * 100,
};

export { FIT };

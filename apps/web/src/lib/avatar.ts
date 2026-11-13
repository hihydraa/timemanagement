import { FIT, getItem, type Slot } from './game';

/**
 * สวมเครื่องแต่งกายซ้อนบนตัวละคร (paper-doll): ทุกพิกัดเป็นสัดส่วนของ "กรอบตัวละคร" (x = สัดส่วนความกว้าง, y = สัดส่วนความสูง)
 * จุดสังเกตต่อตัวละครวัดจากภาพตัดพื้น (public/game/cut/characters/<id>.webp) — ค่าประมาณที่ปรับด้วยตาแล้ว
 */
export interface Landmarks {
  /** ขนาดภาพตัวละคร (px) — ใช้หาอัตราส่วน */
  w: number;
  h: number;
  cx: number; // กลางลำตัว
  headCx: number;
  eyeY: number;
  neckY: number;
  torsoBot: number;
  shortsBot: number;
  feetY: number;
  torsoW: number;
  headW: number;
  /** ตำแหน่งแว่นที่วาดอยู่แล้วบนตัวละคร (ถ้ามี) เพื่อสวมทับพอดี; ไม่ใส่ = ใช้ headCx/eyeY */
  faceCx?: number;
  faceY?: number;
  faceW?: number;
  /** ขอบล่างของหมวก (สัดส่วนความสูง) */
  hatBottom: number;
  /** ความสูงของกล่องรองเท้า */
  shoeH?: number;
  /** ระยะจากกลางลำตัวถึงมือแต่ละข้าง (ถุงมือ) */
  handDx?: number;
}
export const LANDMARKS: Record<string, Landmarks> = {
  harry: {
    faceCx: 0.6,
    faceY: 0.4,
    faceW: 0.58,
    hatBottom: 0.26,
    w: 290,
    h: 454,
    cx: 0.46,
    headCx: 0.5,
    eyeY: 0.4,
    neckY: 0.55,
    torsoBot: 0.78,
    shortsBot: 0.9,
    feetY: 0.97,
    torsoW: 0.36,
    headW: 0.76,
  },
  hermione: {
    hatBottom: 0.27,
    w: 408,
    h: 437,
    cx: 0.57,
    headCx: 0.5,
    eyeY: 0.4,
    neckY: 0.6,
    torsoBot: 0.78,
    shortsBot: 0.88,
    feetY: 0.97,
    torsoW: 0.26,
    headW: 0.6,
  },
  ron: {
    hatBottom: 0.24,
    w: 292,
    h: 453,
    cx: 0.52,
    headCx: 0.5,
    eyeY: 0.38,
    neckY: 0.55,
    torsoBot: 0.78,
    shortsBot: 0.9,
    feetY: 0.97,
    torsoW: 0.34,
    headW: 0.8,
  },
  dumbledore: {
    faceCx: 0.57,
    faceY: 0.31,
    faceW: 0.52,
    hatBottom: 0.12,
    w: 324,
    h: 458,
    cx: 0.45,
    headCx: 0.5,
    eyeY: 0.27,
    neckY: 0.5,
    torsoBot: 0.78,
    shortsBot: 0.88,
    feetY: 0.97,
    torsoW: 0.3,
    headW: 0.62,
  },
  draco: {
    hatBottom: 0.18,
    w: 256,
    h: 408,
    cx: 0.52,
    headCx: 0.5,
    eyeY: 0.3,
    neckY: 0.5,
    torsoBot: 0.75,
    shortsBot: 0.9,
    feetY: 0.97,
    torsoW: 0.3,
    headW: 0.72,
  },
  hagrid: {
    handDx: 0.38,
    shoeH: 0.17,
    hatBottom: 0.12,
    w: 471,
    h: 506,
    cx: 0.5,
    headCx: 0.55,
    eyeY: 0.24,
    neckY: 0.52,
    torsoBot: 0.77,
    shortsBot: 0.88,
    feetY: 0.96,
    torsoW: 0.58,
    headW: 0.62,
  },
};

/** ขอบรอบกรอบตัวละคร (สัดส่วน) ให้หมวก/ไม้/สัตว์ที่ล้นออกนอกตัวยังแสดงครบ */
export const PAD = { x: 0.3, top: 0.24, bottom: 0.12 };

/** ลำดับซ้อน (ล่าง → บน) */
export const Z: Record<Exclude<Slot, 'companion'>, number> = {
  bottom: 1,
  shoes: 2,
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

export interface Box {
  /** ตำแหน่ง/ขนาดเป็น % ของ canvas */
  left: number;
  top: number;
  width: number;
  height: number;
  z: number;
  /** หมุน (องศา) */
  rotate?: number;
  /** ตัดครึ่งภาพ (ใช้กับถุงมือที่เป็นคู่: ซ้าย/ขวา) */
  crop?: 'left' | 'right';
}

/** อัตราส่วนกว้าง/สูงของภาพถุงมือ (ทั้งคู่) */
const GLOVE_ASPECT: Record<string, number> = { 'draco-08': 1.011, 'hagrid-07': 1.167 };

const CW = 1 + 2 * PAD.x;
const CH = 1 + PAD.top + PAD.bottom;
/** กล่องในหน่วยสัดส่วนกรอบตัวละคร (กึ่งกลาง x, บน, ล่าง, กว้าง) → % ของ canvas */
const toBox = (
  x: number,
  top: number,
  bottom: number,
  w: number,
  z: number,
  extra: Partial<Box> = {},
): Box => ({
  left: ((x - w / 2 + PAD.x) / CW) * 100,
  top: ((top + PAD.top) / CH) * 100,
  width: (w / CW) * 100,
  height: ((bottom - top) / CH) * 100,
  z,
  ...extra,
});

/**
 * กล่องของไอเท็มบนตัวละคร (อ้างอิงภาพตัวอย่างที่แต่งครบชุด): ชุดคลุมยาวถึงข้อเท้าและกว้างคลุมไหล่,
 * หมวกครอบถึงหน้าผาก, ผ้าพันคอใหญ่พันรอบคอ, ไม้กายสิทธิ์ถือที่มือซ้าย/ไม้กวาด-ร่มถือที่มือขวา, กระเป๋าสะพายเฉียงที่สะโพกขวา,
 * ถุงมือแยกเป็นสองข้างที่มือ, เนคไทอยู่ใต้ผ้าพันคอ
 */
export function placeItems(charId: string, itemId: string): Box[] {
  const l = LANDMARKS[charId];
  const item = getItem(itemId);
  if (!l || !item || item.slot === 'companion') return [];
  const fit = FIT[itemId];
  const { cx, headCx, neckY, torsoBot, shortsBot, feetY, torsoW, headW } = l;
  const z = Z[item.slot];
  const handY = torsoBot + 0.02;
  switch (item.slot) {
    case 'outer':
      return [toBox(cx, neckY - 0.03, feetY - 0.03, torsoW * 2.0, z)];
    case 'top':
      return [toBox(cx, neckY, torsoBot + 0.03, torsoW * 1.25, z)];
    case 'bottom':
      return [
        toBox(cx, torsoBot - 0.04, fit === 'long' ? feetY - 0.05 : shortsBot + 0.03, torsoW, z),
      ];
    case 'shoes':
      return [toBox(cx, feetY - (l.shoeH ?? 0.09), 1.0, torsoW * 1.15, z)];
    case 'tie':
      return [toBox(cx, neckY + 0.02, neckY + 0.26, torsoW * 0.34, z)];
    case 'neck':
      return [toBox(cx, neckY - 0.045, neckY + 0.24, torsoW * 1.35, z)];
    case 'head':
      return [toBox(headCx, l.hatBottom - 0.34, l.hatBottom, headW * 1.02, z)];
    case 'face': {
      const y = l.faceY ?? l.eyeY;
      return [toBox(l.faceCx ?? headCx, y - 0.06, y + 0.06, l.faceW ?? headW * 0.75, z)];
    }
    case 'hand':
      // ไม้กายสิทธิ์: ถือที่มือซ้ายของภาพ ปลายไม้ชี้ลงนอกตัว (หมุน 180° จากภาพต้นฉบับที่ปลายชี้ขึ้น)
      return [toBox(cx - torsoW * 0.95, handY - 0.16, handY + 0.2, 0.2, z, { rotate: 180 })];
    case 'carry':
      // ไม้กวาด/ร่ม: ถือที่มือขวาของภาพ
      return fit === 'broom'
        ? [toBox(cx + torsoW * 0.95, neckY - 0.1, feetY + 0.02, 0.4, z)]
        : [toBox(cx + torsoW * 0.9, neckY + 0.02, feetY, 0.3, z)];
    case 'gloves': {
      // ภาพถุงมือเป็นคู่: ตัดครึ่งซ้าย/ขวาไปวางที่มือแต่ละข้าง (กว้างของครึ่งหนึ่ง = สูง × สัดส่วนภาพ ÷ 2 แปลงเป็นหน่วยความกว้างตัวละคร)
      const hh = 0.13;
      const aspect = GLOVE_ASPECT[itemId] ?? 1.1;
      const w = (hh * aspect * (l.h / l.w)) / 2;
      const dx = l.handDx ?? torsoW * 0.78;
      return [
        toBox(cx - dx, handY - 0.03, handY - 0.03 + hh, w, z, { crop: 'left' }),
        toBox(cx + dx, handY - 0.03, handY - 0.03 + hh, w, z, { crop: 'right' }),
      ];
    }
    case 'bag':
      return [
        toBox(cx + Math.min(torsoW * 0.75, 0.3), torsoBot - 0.12, torsoBot + 0.1, torsoW * 0.75, z),
      ];
    case 'waist':
      return [toBox(cx, torsoBot - 0.04, torsoBot + 0.03, torsoW * 1.05, z)];
    case 'accessory':
      return fit === 'ring'
        ? [toBox(cx + torsoW * 0.95, torsoBot + 0.03, torsoBot + 0.13, 0.1, z)]
        : [toBox(cx, neckY + 0.07, neckY + 0.22, torsoW * 0.5, z)]; // จี้/นาฬิกาย้อนเวลาที่หน้าอก
  }
}

/** กล่องหลัก (ชิ้นแรก) — คงไว้ให้โค้ด/ทดสอบเดิมใช้ */
export const placeItem = (charId: string, itemId: string): Box | null =>
  placeItems(charId, itemId)[0] ?? null;

/** สัตว์ประจำตัว: นกฮูก/หนูอยู่บนไหล่ขวา, ฟีนิกซ์เกาะไหล่, แมว/สุนัขอยู่ข้างเท้า (ภาพตัดพื้น `cut/companions`) */
export function placePet(charId: string): Box | null {
  const l = LANDMARKS[charId];
  if (!l) return null;
  const { cx, neckY, feetY, torsoW } = l;
  switch (charId) {
    case 'harry':
      return toBox(cx + torsoW * 1.05, neckY - 0.1, neckY + 0.12, 0.24, 13);
    case 'ron':
      return toBox(cx + torsoW * 0.85, neckY - 0.06, neckY + 0.1, 0.2, 13);
    case 'draco':
      return toBox(cx + torsoW * 1.2, neckY - 0.1, neckY + 0.12, 0.24, 13);
    case 'dumbledore':
      return toBox(1.1, neckY - 0.4, neckY - 0.14, 0.5, 13);
    case 'hermione':
      return toBox(cx - torsoW * 1.45, feetY - 0.16, feetY + 0.07, 0.4, 13);
    case 'hagrid':
      return toBox(cx - 0.02, feetY - 0.02, feetY + 0.11, 0.78, 13);
    default:
      return null;
  }
}

/** อัตราส่วน กว้าง/สูง ของ canvas ตัวละคร */
export const canvasAspect = (charId: string): number => {
  const l = LANDMARKS[charId];
  return l ? (CW * l.w) / (CH * l.h) : 0.7;
};

/** ตำแหน่งกรอบตัวละครใน canvas (%) */
export const FIGURE = {
  left: (PAD.x / CW) * 100,
  top: (PAD.top / CH) * 100,
  width: (1 / CW) * 100,
  height: (1 / CH) * 100,
};

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

/** ขอบรอบกรอบตัวละคร (สัดส่วน) ให้หมวก/ไม้ที่ล้นออกนอกตัวยังแสดงครบ */
export const PAD = { x: 0.28, top: 0.24, bottom: 0.04 };

/** ลำดับซ้อน (ล่าง → บน) */
export const Z: Record<Exclude<Slot, 'companion'>, number> = {
  bottom: 1,
  shoes: 2,
  top: 3,
  outer: 4,
  waist: 5,
  neck: 6,
  bag: 7,
  gloves: 8,
  hand: 9,
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
}

/** กล่องของไอเท็มบนตัวละคร (หน่วยสัดส่วนกรอบตัวละคร) → เปอร์เซ็นต์ของ canvas */
export function placeItem(charId: string, itemId: string): Box | null {
  const l = LANDMARKS[charId];
  const item = getItem(itemId);
  if (!l || !item || item.slot === 'companion') return null;
  const fit = FIT[itemId];
  const { cx, headCx, eyeY, neckY, torsoBot, shortsBot, feetY, torsoW, headW } = l;
  let x = cx;
  let w = torsoW;
  let top = neckY;
  let bottom = torsoBot;
  switch (item.slot) {
    case 'outer':
      w = torsoW * 1.7;
      top = neckY - 0.03;
      bottom = shortsBot + 0.04;
      break;
    case 'top':
      w = torsoW * 1.25;
      top = neckY;
      bottom = torsoBot + 0.03;
      break;
    case 'bottom':
      w = torsoW * 1.0;
      top = torsoBot - 0.04;
      bottom = fit === 'long' ? feetY - 0.05 : shortsBot + 0.03;
      break;
    case 'shoes':
      w = torsoW * 1.15;
      top = feetY - (l.shoeH ?? 0.09);
      bottom = 1.0;
      break;
    case 'neck':
      w = torsoW * 0.85;
      top = neckY;
      bottom = neckY + 0.2;
      break;
    case 'head':
      x = headCx;
      w = headW * 0.95;
      bottom = l.hatBottom;
      top = bottom - 0.3;
      break;
    case 'face':
      x = l.faceCx ?? headCx;
      w = l.faceW ?? headW * 0.75;
      top = (l.faceY ?? eyeY) - 0.06;
      bottom = (l.faceY ?? eyeY) + 0.06;
      break;
    case 'hand':
      w = 0.3;
      x = cx + torsoW * 0.5 + 0.15;
      top = neckY - 0.05;
      bottom = feetY;
      break;
    case 'gloves':
      w = torsoW * 1.9;
      top = torsoBot - 0.01;
      bottom = torsoBot + 0.13;
      break;
    case 'bag':
      w = torsoW * 0.75;
      x = cx - Math.min(torsoW * 0.8, 0.3);
      top = torsoBot - 0.06;
      bottom = torsoBot + 0.14;
      break;
    case 'waist':
      w = torsoW * 1.05;
      top = torsoBot - 0.04;
      bottom = torsoBot + 0.03;
      break;
    case 'accessory':
      if (fit === 'ring') {
        w = 0.1;
        x = cx + torsoW * 0.95;
        top = torsoBot + 0.03;
        bottom = torsoBot + 0.13;
      } else {
        w = torsoW * 0.5;
        top = neckY + 0.05;
        bottom = neckY + 0.2;
      }
      break;
  }
  const cw = 1 + 2 * PAD.x;
  const ch = 1 + PAD.top + PAD.bottom;
  return {
    left: ((x - w / 2 + PAD.x) / cw) * 100,
    top: ((top + PAD.top) / ch) * 100,
    width: (w / cw) * 100,
    height: ((bottom - top) / ch) * 100,
    z: Z[item.slot],
  };
}

/** อัตราส่วน กว้าง/สูง ของ canvas ตัวละคร */
export const canvasAspect = (charId: string): number => {
  const l = LANDMARKS[charId];
  return l ? ((1 + 2 * PAD.x) * l.w) / ((1 + PAD.top + PAD.bottom) * l.h) : 0.7;
};

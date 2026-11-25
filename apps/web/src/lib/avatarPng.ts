import {
  CANVAS_H,
  CANVAS_W,
  HAIR_COLORS,
  getAvatarItem,
  type AvatarLook,
} from '../../../../src/lib/avatar2d';

const HAIR_REF_LUMA = 0.69; // ต้องตรงกับตัวกรอง SVG ใน avatar2d.ts

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`โหลดภาพไม่สำเร็จ: ${src}`));
    img.src = src;
  });

/** คูณสีผมแบบเดียวกับตัวกรอง SVG: พิกเซลใหม่ = (สีเป้าหมาย ÷ ความสว่างอ้างอิง) × ความสว่างพิกเซลเดิม */
function tintHair(img: HTMLImageElement, hex: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CANVAS_W;
  c.height = CANVAS_H;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
  const d = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  for (let i = 0; i < d.data.length; i += 4) {
    const y = 0.2126 * d.data[i]! + 0.7152 * d.data[i + 1]! + 0.0722 * d.data[i + 2]!;
    const k = y / HAIR_REF_LUMA;
    d.data[i] = Math.min(255, r * k);
    d.data[i + 1] = Math.min(255, g * k);
    d.data[i + 2] = Math.min(255, b * k);
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

/** วาดตัวละครทั้งตัว (ชุด + ผม) ลง canvas ขนาด CANVAS_W×CANVAS_H พื้นโปร่งใส */
export async function renderAvatarCanvas(look: AvatarLook): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.width = CANVAS_W;
  c.height = CANVAS_H;
  const ctx = c.getContext('2d')!;
  const outfit = look.items.outfit ? getAvatarItem(look.items.outfit) : undefined;
  const hair = look.items.hair ? getAvatarItem(look.items.hair) : undefined;
  const [o, h] = await Promise.all([
    outfit ? loadImage(`/avatar2d/${outfit.file}`) : null,
    hair ? loadImage(`/avatar2d/${hair.file}`) : null,
  ]);
  if (o) ctx.drawImage(o, 0, 0, CANVAS_W, CANVAS_H);
  if (h) {
    const hex = HAIR_COLORS.find((x) => x.id === look.hairColor)?.color;
    ctx.drawImage(
      look.hairColor === 'natural' || !hex ? h : tintHair(h, hex),
      0,
      0,
      CANVAS_W,
      CANVAS_H,
    );
  }
  return c;
}

export const canvasToPng = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('สร้างภาพไม่สำเร็จ'))), 'image/png'),
  );

/** ภาพสำหรับหัวการ์ด LINE (อัตราส่วน 20:13 พื้นโปร่งใส ตัวละครอยู่กลาง) */
export async function renderLineHeroPng(look: AvatarLook): Promise<Blob> {
  const avatar = await renderAvatarCanvas(look);
  const out = document.createElement('canvas');
  out.width = 600;
  out.height = 390;
  const h = 380;
  const w = (h * CANVAS_W) / CANVAS_H;
  out.getContext('2d')!.drawImage(avatar, (out.width - w) / 2, 5, w, h);
  return canvasToPng(out);
}

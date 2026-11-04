import type { Category, ColorMode, Task } from './types';

export const URGENCY_COLORS: Record<number, string> = {
  4: '#dc2626',
  3: '#ea580c',
  2: '#eab308',
  1: '#9ca3af',
};
export const IMPORTANCE_COLORS: Record<number, string> = {
  4: '#1d4ed8',
  3: '#3b82f6',
  2: '#60a5fa',
  1: '#94a3b8',
};
export const NO_CATEGORY_COLOR = '#64748b';

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** เลือกขาว/ดำให้ contrast สูงสุดบนพื้นสีนั้น (ผ่าน WCAG AA สำหรับสีพื้นส่วนใหญ่) */
export function textColorFor(bg: string): string {
  const L = luminance(bg);
  const white = 1.05 / (L + 0.05);
  const black = (L + 0.05) / 0.05;
  return white >= black ? '#ffffff' : '#111827';
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** สีพาสเทลของ event: พื้นอ่อน (L≈90%) + ตัวอักษรเข้มของ hue เดียวกัน (contrast ≥ 7:1) + สีเต็มสำหรับจุด */
export function pastel(color: string): { bg: string; text: string; dot: string } {
  const [h, s0] = hexToHsl(color);
  const s = Math.min(0.62, Math.max(0.22, s0));
  const bg = hslToHex(h, s, 0.9);
  let l = 0.26;
  let text = hslToHex(h, Math.min(0.7, s0 + 0.1), l);
  while (contrast(text, bg) < 7 && l > 0.06) {
    l -= 0.02;
    text = hslToHex(h, Math.min(0.7, s0 + 0.1), l);
  }
  return { bg, text, dot: color };
}

export function eventColors(task: Task, mode: ColorMode, cats: Map<string, Category>) {
  const catColor = (task.categoryId && cats.get(task.categoryId)?.color) || NO_CATEGORY_COLOR;
  const base =
    mode === 'urgency'
      ? URGENCY_COLORS[task.urgency]!
      : mode === 'importance'
        ? IMPORTANCE_COLORS[task.importance]!
        : catColor;
  const p = pastel(base);
  // แถบซ้าย = ความเร่งด่วนเสมอ (ไม่ขึ้นกับโหมดย้อมสี)
  return { bg: p.bg, text: p.text, dot: p.dot, stripe: URGENCY_COLORS[task.urgency]! };
}

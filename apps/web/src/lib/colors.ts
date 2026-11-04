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

export function eventColors(task: Task, mode: ColorMode, cats: Map<string, Category>) {
  const catColor = (task.categoryId && cats.get(task.categoryId)?.color) || NO_CATEGORY_COLOR;
  const bg =
    mode === 'urgency'
      ? URGENCY_COLORS[task.urgency]!
      : mode === 'importance'
        ? IMPORTANCE_COLORS[task.importance]!
        : catColor;
  // โหมดย้อมสีตามความเร่งด่วน แถบซ้ายจะกลืนกับพื้น จึงใช้สีเข้มแทน
  const stripe = mode === 'urgency' ? 'rgba(0,0,0,0.45)' : URGENCY_COLORS[task.urgency]!;
  return { bg, text: textColorFor(bg), stripe };
}

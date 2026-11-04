/** tick แกน Y เป็นจำนวนเต็มไม่ซ้ำ: 0..max ถ้า max ≤ 4, ไม่งั้น 0, ครึ่งหนึ่ง, max (ปัดเป็นจำนวนเต็ม) */
export function yTicks(max: number): number[] {
  const top = Math.max(1, Math.ceil(max));
  if (top <= 4) return Array.from({ length: top + 1 }, (_, i) => i);
  return [...new Set([0, Math.round(top / 2), top])];
}

/** ข้อมูลน้อยจนกราฟแท่งไม่มีความหมาย: ช่วง ≤ 14 วัน และมีงานเสร็จไม่เกิน 3 วัน → ใช้ heatmap รายวันแทน */
export function isSparse(daily: { completed: number }[]): boolean {
  return daily.length <= 14 && daily.filter((d) => d.completed > 0).length <= 3;
}

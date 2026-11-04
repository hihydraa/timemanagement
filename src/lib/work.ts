/** วันทำงาน (ISO 1=จันทร์…7=อาทิตย์) จากสตริง "1,2,3,4,5"; ค่าเสียใช้ค่าเริ่มต้น จันทร์–ศุกร์ */
export function parseWorkDays(raw: string | null | undefined): number[] {
  const v = (raw ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  return v.length ? [...new Set(v)].sort() : [1, 2, 3, 4, 5];
}

/** ประเภทวันหยุดงาน (ใช้ร่วมกันเซิร์ฟเวอร์/เว็บ) */
export const DAY_OFF_KINDS = ['vacation', 'sick', 'personal', 'holiday', 'other'] as const;
export type DayOffKind = (typeof DAY_OFF_KINDS)[number];

export const DAY_OFF_TH: Record<DayOffKind, string> = {
  vacation: 'ลาพักร้อน',
  sick: 'ลาป่วย',
  personal: 'ลากิจ',
  holiday: 'วันหยุดบริษัท/นักขัตฤกษ์',
  other: 'อื่น ๆ',
};

/** YYYY-MM-DD ที่เป็นวันจริง (ปี 2000–2100) */
export const isYmd = (s: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
};

/** วันทำงานมาตรฐานสำหรับแปลงชั่วโมงลาเป็น "วัน" ในสรุป (8 ชม.) */
export const DAY_MINUTES = 480;
export const MAX_PARTIAL_HOURS = 12;

/** จำนวนวันที่หยุดจริง: เต็มวัน = 1, หยุดบางชั่วโมง = สัดส่วนของ 8 ชม. (ปัดเป็นทีละครึ่งวัน) */
export const dayFraction = (minutes: number): number =>
  minutes <= 0 ? 1 : Math.max(0.5, Math.round(Math.min(1, minutes / DAY_MINUTES) * 2) / 2);

/** ข้อความระยะเวลาที่หยุด: '' = เต็มวัน */
export function offDuration(minutes: number): string {
  if (minutes <= 0) return '';
  if (minutes === 240) return 'ครึ่งวัน (4 ชม.)';
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} ชม.`;
}

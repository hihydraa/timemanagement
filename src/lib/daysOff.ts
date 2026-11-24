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

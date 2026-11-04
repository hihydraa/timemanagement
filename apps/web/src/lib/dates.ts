import { todayYmd, wallNow } from './time';

/** วันที่ (ไทย) ของ "วันนี้ + n วัน" */
export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** วันจันทร์ของสัปดาห์ที่ ymd อยู่ */
export function mondayOf(ymd: string): string {
  const wd = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return addDaysYmd(ymd, -((wd + 6) % 7));
}

export const nextMonday = (): string => addDaysYmd(mondayOf(todayYmd()), 7);
export const tomorrow = (): string => addDaysYmd(todayYmd(), 1);

const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const TH_MON = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

/** เช่น "พ. 4 พ.ย." */
export function dayLabel(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${TH_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${TH_MON[d.getUTCMonth()]}`;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} นาที`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

export { todayYmd, wallNow };

/**
 * สัปดาห์ที่หน้ารีวิวเปิดเป็นค่าเริ่มต้น (วันจันทร์ของสัปดาห์นั้น):
 * จันทร์–พุธ = สัปดาห์ที่แล้ว (สรุปสัปดาห์ที่เพิ่งจบ), พฤหัส–อาทิตย์ = สัปดาห์ปัจจุบัน
 */
export function defaultReviewWeek(today: string): string {
  const monday = mondayOf(today);
  const dayIndex = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // จ=0 … อา=6
  return dayIndex <= 2 ? addDaysYmd(monday, -7) : monday;
}

/** ป้ายสัปดาห์เทียบกับวันนี้: "สัปดาห์นี้" / "สัปดาห์ที่แล้ว" / "สัปดาห์หน้า" / "สัปดาห์ของ จ. 20 ต.ค." */
export function weekLabel(weekStart: string, today: string): string {
  const diff = Math.round(
    (Date.parse(`${weekStart}T00:00:00Z`) - Date.parse(`${mondayOf(today)}T00:00:00Z`)) /
      (7 * 864e5),
  );
  if (diff === 0) return 'สัปดาห์นี้';
  if (diff === -1) return 'สัปดาห์ที่แล้ว';
  if (diff === 1) return 'สัปดาห์หน้า';
  return `สัปดาห์ของ ${dayLabel(weekStart)}`;
}

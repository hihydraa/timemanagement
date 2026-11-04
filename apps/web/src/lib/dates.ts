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

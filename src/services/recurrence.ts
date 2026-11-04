import { addDays } from '../lib/time';

/**
 * กฎทำซ้ำ (RRULE subset): FREQ=DAILY|WEEKLY|MONTHLY ; INTERVAL ; BYDAY ; UNTIL=YYYYMMDD
 * วันที่ทั้งหมดเป็น YYYY-MM-DD เวลาไทย "งานแม่" เก็บ anchor (ครั้งแรก) ครั้งถัดไปเป็นผลลัพธ์ของฟังก์ชันนี้ (ไม่รวม anchor)
 */
export interface Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  /** 0 = อาทิตย์ … 6 = เสาร์ (เฉพาะ WEEKLY; ว่าง = วันเดียวกับ anchor) */
  byday: number[];
  /** YYYY-MM-DD (รวมวันนั้น) */
  until: string | null;
}

const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export const MAX_OCCURRENCES = 400;

export function parseRule(s: string | null | undefined): Rule | null {
  if (!s) return null;
  const kv: Record<string, string> = {};
  for (const part of s.split(';')) {
    const [k, v] = part.split('=');
    if (!k || v === undefined) return null;
    kv[k] = v;
  }
  const freq = kv.FREQ;
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') return null;
  const interval = kv.INTERVAL === undefined ? 1 : Number(kv.INTERVAL);
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) return null;
  let byday: number[] = [];
  if (kv.BYDAY) {
    byday = kv.BYDAY.split(',').map((c) => CODES.indexOf(c));
    if (byday.some((d) => d < 0)) return null;
    byday = [...new Set(byday)];
  }
  let until: string | null = null;
  if (kv.UNTIL) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(kv.UNTIL);
    if (!m) return null;
    until = `${m[1]}-${m[2]}-${m[3]}`;
  }
  return { freq, interval, byday, until };
}

// ---- วันที่เป็นเลขวัน (days since epoch) เพื่อคำนวณเร็วและไม่ผูกกับ timezone
const toDays = (d: string): number => {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, dd) / 86_400_000);
};
const fromDays = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);
const weekday = (days: number): number => (((days + 4) % 7) + 7) % 7; // 1970-01-01 = พฤหัส(4)
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * วันที่ของแต่ละครั้งใน [from, to] (รวมขอบ) ที่อยู่หลัง anchor ตามกฎ
 * ตัดที่ UNTIL และไม่เกิน `cap` ครั้ง
 */
export function occurrences(
  rule: Rule,
  anchor: string,
  from: string,
  to: string,
  cap = MAX_OCCURRENCES,
): string[] {
  const a = toDays(anchor);
  const lo = Math.max(toDays(from), a + 1); // ไม่รวม anchor เอง (แถวแม่แทนครั้งแรก)
  let hi = toDays(to);
  if (rule.until) hi = Math.min(hi, toDays(rule.until));
  if (lo > hi) return [];
  const out: number[] = [];
  const push = (n: number) => {
    if (n >= lo && n <= hi && n > a) out.push(n);
  };

  if (rule.freq === 'DAILY') {
    const k0 = Math.max(1, Math.ceil((lo - a) / rule.interval));
    for (let d = a + k0 * rule.interval; d <= hi && out.length < cap; d += rule.interval) push(d);
  } else if (rule.freq === 'WEEKLY') {
    const offsets = (rule.byday.length ? rule.byday : [weekday(a)])
      .map((d) => (d + 6) % 7)
      .sort((x, y) => x - y);
    const aMon = a - ((weekday(a) + 6) % 7);
    const loMon = lo - ((weekday(lo) + 6) % 7);
    let w = Math.max(0, Math.floor((loMon - aMon) / 7));
    w -= w % rule.interval; // สัปดาห์ต้องเรียงตาม INTERVAL จาก anchor
    for (; aMon + w * 7 <= hi && out.length < cap; w += rule.interval) {
      for (const off of offsets) push(aMon + w * 7 + off);
    }
  } else {
    const [ay, am, ad] = anchor.split('-').map(Number) as [number, number, number];
    const base = ay * 12 + (am - 1);
    const [ly, lm] = fromDays(lo).split('-').map(Number) as [number, number];
    let k = Math.max(1, Math.floor((ly * 12 + (lm - 1) - base) / rule.interval) - 1);
    for (; out.length < cap; k++) {
      const mi = base + k * rule.interval;
      const y = Math.floor(mi / 12);
      const m = (mi % 12) + 1;
      if (toDays(`${y}-${String(m).padStart(2, '0')}-01`) > hi) break;
      if (ad > daysInMonth(y, m)) continue; // เดือนที่ไม่มีวันนั้น (เช่น 31) ข้าม ตาม RRULE
      push(toDays(`${y}-${String(m).padStart(2, '0')}-${String(ad).padStart(2, '0')}`));
    }
  }
  return out
    .sort((x, y) => x - y)
    .slice(0, cap)
    .map(fromDays);
}

/** เป็นวันที่ที่กฎให้ผล (หรือคือ anchor) หรือไม่ — ใช้กันการสร้างแถวจริงจากวันที่มั่ว ๆ */
export function isOccurrence(rule: Rule, anchor: string, date: string): boolean {
  return occurrences(rule, anchor, date, date, 1).length === 1;
}

export { addDays };

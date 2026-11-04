/** ฟังก์ชันเวลาทั้งหมดต้องผ่านไฟล์นี้ เพื่อให้ test freeze เวลาได้ */
export const TZ = 'Asia/Bangkok';
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // ไทยไม่มี DST

let frozenNow: Date | null = null;

export function freezeNow(d: Date | null): void {
  frozenNow = d;
}

export function now(): Date {
  return frozenNow ? new Date(frozenNow) : new Date();
}

export function nowIso(): string {
  return now().toISOString();
}

export interface BangkokParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=อาทิตย์ .. 6=เสาร์
}

export function bangkokParts(d: Date = now()): BangkokParts {
  const s = new Date(d.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth() + 1,
    day: s.getUTCDate(),
    hour: s.getUTCHours(),
    minute: s.getUTCMinutes(),
    weekday: s.getUTCDay(),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD ตามเวลา Bangkok */
export function bangkokDate(d: Date = now()): string {
  const p = bangkokParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** HH:mm ตามเวลา Bangkok */
export function bangkokHm(d: Date = now()): string {
  const p = bangkokParts(d);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** แปลง "YYYY-MM-DD" + "HH:mm" (เวลา Bangkok) เป็น Date (UTC instant) */
export function fromBangkok(date: string, hm = '00:00'): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, h!, mi!) - BANGKOK_OFFSET_MS);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

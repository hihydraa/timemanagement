import { useSyncExternalStore } from 'react';
import type { DayState } from '../../../../src/lib/dobbyVoice';

/**
 * สถานการณ์ของวันที่ Dobby ใช้ตัดสินใจว่าจะพูดอะไร/ทำท่าอะไร (หน้า "วันนี้" อัปเดตทุกครั้งที่โหลดข้อมูล)
 * เก็บในหน่วยความจำเท่านั้น; null = ยังไม่มีข้อมูล (Dobby จะไม่ทักทาย)
 */
export interface DobbyData {
  open: number;
  overdue: number;
  doneToday: number;
  streak: number;
  dayOff: boolean;
}
let cur: DobbyData | null = null;
const listeners = new Set<() => void>();

export function setDobbyData(next: DobbyData | null) {
  const same =
    cur && next && (Object.keys(next) as (keyof DobbyData)[]).every((k) => cur![k] === next[k]);
  if (same) return;
  cur = next;
  for (const l of listeners) l();
}
export const getDobbyData = (): DobbyData | null => cur;

export function useDobbyData(): DobbyData | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => cur,
  );
}

/** ชั่วโมงเวลาไทย 0–23 */
export const bangkokHour = (d: Date = new Date()): number =>
  Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok',
    }).format(d),
  ) % 24;

export const toDayState = (d: DobbyData, noProfile: boolean, hour = bangkokHour()): DayState => ({
  hour,
  open: d.open,
  overdue: d.overdue,
  doneToday: d.doneToday,
  streak: d.streak,
  dayOff: d.dayOff,
  noProfile,
});

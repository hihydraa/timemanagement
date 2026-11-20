import { useSyncExternalStore } from 'react';
import type { Route } from './route';

/**
 * ภาพนิ่งตัวละครมุมขวาล่าง เก็บในหน่วยความจำของหน้าเว็บเท่านั้น (ค่าจริงอยู่ที่เซิร์ฟเวอร์ตามบัญชี)
 * ไม่ใช้ localStorage เพื่อไม่ให้ผู้ใช้อีกบัญชีบนเครื่องเดียวกันเห็นภาพของคนก่อนหน้า
 */
let current: string | null = null;
const listeners = new Set<() => void>();

export function setAvatarSnapshot(url: string | null) {
  current = url;
  for (const l of listeners) l();
}

export function useAvatarSnapshot(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => current,
  );
}

/** ตัวละครมุมขวาล่างแสดงเมื่อมีภาพ และไม่ใช่ตอนที่อยู่แท็บอวตารซึ่งมีตัวใหญ่อยู่แล้ว */
export const isCornerVisible = (route: Route, snapshot: string | null): boolean =>
  !!snapshot && !(route.view === 'me' && route.me === 'avatar');

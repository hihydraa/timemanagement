import { useSyncExternalStore } from 'react';
import type { AvatarLook } from '../../../../src/lib/avatar2d';
import type { Route } from './route';

export type { AvatarLook };

/**
 * หน้าตาตัวละคร 2D ของผู้ใช้ (ใช้แสดงมุมขวาล่าง) เก็บในหน่วยความจำของหน้าเว็บเท่านั้น (ค่าจริงอยู่ที่เซิร์ฟเวอร์ตามบัญชี)
 * ไม่ใช้ localStorage เพื่อไม่ให้ผู้ใช้อีกบัญชีบนเครื่องเดียวกันเห็นตัวละครของคนก่อนหน้า
 */
let current: AvatarLook | null = null;
const listeners = new Set<() => void>();

export function setAvatarLook(look: AvatarLook | null) {
  current = look;
  for (const l of listeners) l();
}

export function useAvatarLook(): AvatarLook | null {
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

/** ตัวละครมุมขวาล่างแสดงเมื่อผู้ใช้เคยบันทึกตัวละคร และไม่ใช่ตอนอยู่แท็บตัวละครซึ่งมีตัวใหญ่อยู่แล้ว */
export const isCornerVisible = (route: Route, look: AvatarLook | null): boolean =>
  !!look && !(route.view === 'me' && route.me === 'avatar');

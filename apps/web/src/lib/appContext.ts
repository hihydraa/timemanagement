import { createContext, useContext } from 'react';
import type { Route, View } from './route';
import type { Category, GcalStatus, User } from './types';

export type { View } from './route';

export type UiMode = 'simple' | 'full';

export interface AppCtx {
  /** โหมดหน้าจอ: simple ซ่อนฟีเจอร์ละเอียด (ไม่ลบ) / full เปิดทั้งหมด */
  uiMode: UiMode;
  setUiMode: (m: UiMode) => void;
  user: User;
  categories: Category[];
  reloadCategories: () => void;
  /** เชื่อม Google Calendar และเปิดซิงก์อยู่ → ฟอร์มงานแสดงสวิตช์ซิงก์ */
  gcalAvailable: boolean;
  gcalStatus: GcalStatus | null;
  route: Route;
  openLine: () => void;
  openSettings: () => void;
  openGcal: () => void;
  openExport: () => void;
  openImport: () => void;
  openAlarms: () => void;
  /** เปิดตัวช่วยตั้งค่าเริ่มต้น (onboarding) อีกครั้ง */
  openOnboarding: () => void;
  logout: () => void;
  /** ไปแท็บ/จุดที่ต้องการ: today(+anchor) / plan(+'matrix') / me(+แท็บย่อย) / focus */
  goTo: (v: View, sub?: string) => void;
  /** ปุ่ม + (FAB): ไปหน้า "วันนี้" แล้วเปิดการเพิ่มงาน */
  newTask: () => void;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp must be used inside AppShell');
  return c;
}

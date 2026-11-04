import { createContext, useContext } from 'react';
import type { Category, User } from './types';

export type View = 'calendar' | 'inbox' | 'matrix' | 'focus' | 'review' | 'stats';

export interface AppCtx {
  user: User;
  categories: Category[];
  reloadCategories: () => void;
  /** เชื่อม Google Calendar และเปิดซิงก์อยู่ → ฟอร์มงานแสดงสวิตช์ซิงก์ */
  gcalAvailable: boolean;
  openLine: () => void;
  openSettings: () => void;
  goTo: (v: View) => void;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp must be used inside AppShell');
  return c;
}

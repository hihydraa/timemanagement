import { t } from './i18n';
import type { DayOffKind } from './types';

export const KINDS: DayOffKind[] = ['vacation', 'sick', 'personal', 'holiday', 'other'];

/** ไอคอน+สีต่อประเภท (ไม่พึ่งสีอย่างเดียว: ไอคอนและชื่อประเภทแสดงคู่กันเสมอ) */
export const STYLE: Record<DayOffKind, { icon: string; cls: string }> = {
  vacation: { icon: '🏖', cls: 'bg-sky-200 text-sky-950 dark:bg-sky-800 dark:text-sky-50' },
  sick: { icon: '🤒', cls: 'bg-rose-200 text-rose-950 dark:bg-rose-800 dark:text-rose-50' },
  personal: { icon: '📝', cls: 'bg-amber-200 text-amber-950 dark:bg-amber-700 dark:text-amber-50' },
  holiday: {
    icon: '🎌',
    cls: 'bg-emerald-200 text-emerald-950 dark:bg-emerald-800 dark:text-emerald-50',
  },
  other: { icon: '•', cls: 'bg-slate-300 text-slate-900 dark:bg-slate-600 dark:text-slate-50' },
};

export const kindTh = (k: string): string => t.daysOff.kinds[k] ?? k;

import type { ReactElement } from 'react';
import { t } from '../../lib/i18n';
import type { View } from '../../lib/route';
import { MeIcon, PlanIcon, TodayIcon } from './TabIcons';

export const TABS: { view: Exclude<View, 'focus'>; icon: () => ReactElement }[] = [
  { view: 'today', icon: TodayIcon },
  { view: 'plan', icon: PlanIcon },
  { view: 'me', icon: MeIcon },
];

/** เมนูหลัก 3 แท็บ: วันนี้ / แผน / ฉัน (เดสก์ท็อป = แถบบน) */
export function TopTabs({
  view,
  warn,
  onGo,
}: {
  view: View;
  /** แท็บ "ฉัน" มีเรื่องต้องดู (เช่น Google ต้องเชื่อมใหม่) */
  warn: boolean;
  onGo: (v: View) => void;
}) {
  return (
    <nav aria-label="หน้าหลัก" className="-mb-px flex flex-1 gap-1">
      {TABS.map(({ view: v }) => (
        <button
          key={v}
          type="button"
          aria-current={view === v ? 'page' : undefined}
          onClick={() => onGo(v)}
          className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm ${view === v ? 'border-brand-600 font-semibold text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'}`}
        >
          {t.views[v]}
          {v === 'me' && warn && (
            <span role="img" aria-label={t.gcal.reconnectWarn} className="ml-1 text-amber-600">
              ⚠
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

/** เมนูหลักบนมือถือ: แถบล่าง 3 แท็บ + ปุ่ม + (FAB) ลอยกลางแถบ */
export function BottomTabBar({
  view,
  warn,
  onGo,
  onNew,
}: {
  view: View;
  warn: boolean;
  onGo: (v: View) => void;
  onNew: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(35,48,42,0.08)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <nav aria-label="หน้าหลัก" className="mx-auto grid max-w-md grid-cols-3">
        {TABS.map(({ view: v, icon: Icon }) => {
          const on = view === v;
          return (
            <button
              key={v}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => onGo(v)}
              className={`flex min-h-[4.5rem] flex-col items-center justify-end gap-0.5 pb-1.5 pt-1 text-xs ${on ? 'font-semibold text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300'} ${v === 'plan' ? 'pt-9' : ''}`}
            >
              <span
                className={`rounded-full px-4 py-0.5 ${on ? 'bg-brand-100 dark:bg-brand-800' : ''}`}
              >
                <Icon />
              </span>
              <span>
                {t.views[v]}
                {v === 'me' && warn && (
                  <span
                    role="img"
                    aria-label={t.gcal.reconnectWarn}
                    className="ml-0.5 text-amber-600"
                  >
                    ⚠
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={onNew}
        aria-label={t.nav.newTask}
        className="absolute left-1/2 -top-6 z-10 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-brand-600 text-3xl leading-none text-white shadow-lg ring-4 ring-white hover:bg-brand-700 dark:ring-slate-900"
      >
        +
      </button>
    </div>
  );
}

import { t } from '../../lib/i18n';

export type CalMode = 'cards' | 'grid' | 'month' | 'list';
export const CAL_MODES: CalMode[] = ['cards', 'grid', 'month', 'list'];

/** แถบเครื่องมือเดียวของปฏิทินทุกมุมมอง: เลื่อนช่วง / วันนี้ / ชื่อช่วง / สลับมุมมอง (การ์ด · ตารางเวลา · เดือน · รายการ) */
export default function CalToolbar({
  title,
  mode,
  onMode,
  onPrev,
  onNext,
  onToday,
  trayCount,
  onTray,
}: {
  title: string;
  mode: CalMode;
  onMode: (m: CalMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** มือถือ: ปุ่มเปิดถาดงาน (bottom sheet) */
  trayCount?: number;
  onTray?: () => void;
}) {
  const round = 'h-9 w-9 rounded-full bg-brand-600 text-white hover:bg-brand-700';
  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="ปฏิทิน">
      <div className="flex gap-1">
        <button type="button" aria-label={t.cal.prev} onClick={onPrev} className={round}>
          ‹
        </button>
        <button type="button" aria-label={t.cal.next} onClick={onNext} className={round}>
          ›
        </button>
      </div>
      <button
        type="button"
        onClick={onToday}
        className="h-9 rounded-full border border-slate-300 px-4 text-sm font-medium hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
      >
        {t.cal.today}
      </button>
      <h2
        className="min-w-0 flex-1 text-center text-base font-semibold sm:text-lg"
        aria-live="polite"
      >
        {title}
      </h2>
      {onTray && (
        <button
          type="button"
          onClick={onTray}
          className="h-9 rounded-full border border-slate-300 px-3 text-sm hover:bg-slate-100 lg:hidden dark:border-slate-600 dark:hover:bg-slate-800"
        >
          {t.tray.title} {trayCount ? `(${trayCount})` : ''}
        </button>
      )}
      <div
        role="group"
        aria-label={t.cal.viewMode}
        className="flex overflow-hidden rounded-full border border-slate-300 text-sm dark:border-slate-600"
      >
        {CAL_MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => onMode(m)}
            className={`px-3 py-1.5 ${mode === m ? 'bg-brand-700 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            {t.cal.modes[m]}
          </button>
        ))}
      </div>
    </div>
  );
}

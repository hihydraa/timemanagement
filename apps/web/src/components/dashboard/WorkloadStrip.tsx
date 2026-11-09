import { addDaysYmd, dayLabel } from '../../lib/dates';
import { t } from '../../lib/i18n';
import type { DashboardData } from '../../lib/dashboard';
import { dayLoad, fmtDuration, scheduledOn, type DayLoad } from '../../lib/planner';

const STATUS: Record<DayLoad['status'], { icon: string; cls: string }> = {
  ok: { icon: '✓', cls: 'bg-green-500' },
  warn: { icon: '!', cls: 'bg-amber-500' },
  over: { icon: '⚠', cls: 'bg-red-600' },
  off: { icon: '–', cls: 'bg-slate-300 dark:bg-slate-600' },
};

/** ภาระงาน 7 วันข้างหน้า: แท่งเทียบเวลาที่ต้องใช้กับเวลาว่าง พร้อมไอคอน+ข้อความสถานะ (ไม่พึ่งสี) */
export default function WorkloadStrip({ d, onGo }: { d: DashboardData; onGo: () => void }) {
  const w = t.dash.load;
  const days = Array.from({ length: 7 }, (_, i) => addDaysYmd(d.today, i)).map((ymd) => ({
    ymd,
    load: dayLoad(
      ymd,
      d.work,
      d.week.filter((x) => scheduledOn(x, ymd)),
    ),
  }));
  const over = days.filter((x) => x.load.status === 'over');
  const free = days
    .filter((x) => x.load.status === 'ok' && x.load.workDay)
    .sort((a, b) => (a.load.ratio ?? 0) - (b.load.ratio ?? 0))[0];
  return (
    <section
      aria-label={w.title}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">🗓 {w.title}</h2>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onGo}
          className="text-xs text-brand-700 underline dark:text-brand-300"
        >
          {w.openPlan}
        </button>
      </div>
      <ol className="mt-2 grid grid-cols-7 gap-1.5">
        {days.map(({ ymd, load }) => {
          const ratio =
            load.ratio === null ? 0 : Math.min(1.5, load.ratio === Infinity ? 1.5 : load.ratio);
          const st = STATUS[load.status];
          return (
            <li key={ymd} className="flex flex-col items-center gap-1 text-center">
              <span className="text-[10px] text-slate-600 dark:text-slate-300">
                {dayLabel(ymd).split(' ')[0]}
              </span>
              <div
                className="flex h-20 w-full items-end overflow-hidden rounded bg-slate-100 dark:bg-slate-900"
                role="img"
                aria-label={`${dayLabel(ymd)}: ${load.status === 'off' ? w.off : `${w.status[load.status]} — ${fmtDuration(load.planned)} / ${fmtDuration(load.available)}`}`}
              >
                <span
                  className={`w-full ${st.cls}`}
                  style={{ height: `${(ratio / 1.5) * 100}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold" aria-hidden>
                {st.icon}
              </span>
              <span className="text-[10px] tabular-nums text-slate-600 dark:text-slate-300">
                {load.status === 'off' ? '' : fmtDuration(load.planned)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
        {over.length
          ? w.overNote.replace('{days}', over.map((x) => dayLabel(x.ymd)).join(', '))
          : w.okNote}
        {over.length > 0 && free && ` ${w.freeNote.replace('{day}', dayLabel(free.ymd))}`}
      </p>
      <p className="text-[11px] text-slate-600 dark:text-slate-300">{w.legend}</p>
    </section>
  );
}

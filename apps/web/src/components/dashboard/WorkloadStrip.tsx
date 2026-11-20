import { useState } from 'react';
import { addDaysYmd, dayLabel } from '../../lib/dates';
import { t } from '../../lib/i18n';
import type { DashboardData } from '../../lib/dashboard';
import {
  bkMinute,
  dayLoad,
  fmtDuration,
  isAppointment,
  minToHm,
  scheduledOn,
  type DayLoad,
} from '../../lib/planner';

const STATUS: Record<DayLoad['status'], { icon: string; cls: string }> = {
  ok: { icon: '✓', cls: 'bg-green-500' },
  warn: { icon: '!', cls: 'bg-amber-500' },
  over: { icon: '⚠', cls: 'bg-red-600' },
  off: { icon: '–', cls: 'bg-slate-300 dark:bg-slate-600' },
};

/** ภาระงาน 7 วันข้างหน้า: แท่งเทียบเวลาที่ต้องใช้กับเวลาว่าง พร้อมไอคอน+ข้อความสถานะ (ไม่พึ่งสี) */
export default function WorkloadStrip({
  d,
  onGo,
  onOpen,
}: {
  d: DashboardData;
  onGo: () => void;
  /** เปิดป๊อปอัปของงาน (ส่ง id ให้หน้าแม่ดึงรายละเอียดเต็ม) */
  onOpen: (id: string) => void;
}) {
  const w = t.dash.load;
  const [picked, setPicked] = useState<string | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDaysYmd(d.today, i)).map((ymd) => {
    const items = d.week.filter((x) => scheduledOn(x, ymd));
    return { ymd, items, load: dayLoad(ymd, d.work, items) };
  });
  const sel = days.find((x) => x.ymd === (picked ?? d.today)) ?? days[0]!;
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
        {days.map(({ ymd, load, items }) => {
          const ratio =
            load.ratio === null ? 0 : Math.min(1.5, load.ratio === Infinity ? 1.5 : load.ratio);
          const st = STATUS[load.status];
          return (
            <li key={ymd}>
              <button
                type="button"
                aria-pressed={sel.ymd === ymd}
                onClick={() => setPicked(ymd)}
                className={`flex w-full flex-col items-center gap-1 rounded-lg p-0.5 text-center ${sel.ymd === ymd ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-950' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}`}
              >
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
                <span className="text-[10px] text-slate-600 dark:text-slate-300">
                  {items.length > 0 ? w.count.replace('{n}', String(items.length)) : '\u00a0'}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 rounded-xl bg-slate-50 p-2 dark:bg-slate-900">
        <h3 className="text-xs font-semibold">{w.dayTasks.replace('{day}', dayLabel(sel.ymd))}</h3>
        {sel.items.length === 0 ? (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{w.noTasks}</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {[...sel.items]
              .sort((a, b) =>
                (a.startAt ?? a.dueAt ?? '~').localeCompare(b.startAt ?? b.dueAt ?? '~'),
              )
              .map((x) => {
                const at = x.startAt ?? x.dueAt;
                return (
                  <li key={x.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(x.id)}
                      className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <span className="w-11 shrink-0 text-xs tabular-nums text-slate-600 dark:text-slate-300">
                        {at && !x.allDay ? minToHm(bkMinute(at)) : ''}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{x.title}</span>
                      {isAppointment(x) && (
                        <span className="shrink-0 rounded-full bg-slate-200 px-1.5 text-[11px] dark:bg-slate-700">
                          {w.appt}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
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

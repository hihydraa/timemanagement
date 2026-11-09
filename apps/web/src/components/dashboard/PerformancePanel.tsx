import { useApp } from '../../lib/appContext';
import { NO_CATEGORY_COLOR } from '../../lib/colors';
import { dayLabel } from '../../lib/dates';
import { t } from '../../lib/i18n';
import type { DashboardData } from '../../lib/dashboard';

/** ประสิทธิภาพ: งานที่เสร็จต่อสัปดาห์ (8 สัปดาห์), สัดส่วนตามประเภทของเดดไลน์เดือนนี้ — ทุกแท่งมีตัวเลข/ชื่อกำกับ */
export default function PerformancePanel({ d }: { d: DashboardData }) {
  const { categories } = useApp();
  const w = t.dash.perf;
  const max = Math.max(1, ...d.performance.weekly.map((x) => x.done));
  const cats = d.deadlines.byCategory
    .map((c) => ({
      ...c,
      name: categories.find((k) => k.id === c.categoryId)?.name ?? t.form.none,
      color: categories.find((k) => k.id === c.categoryId)?.color ?? NO_CATEGORY_COLOR,
    }))
    .sort((a, b) => b.open + b.done - (a.open + a.done));
  const catMax = Math.max(1, ...cats.map((c) => c.open + c.done));
  const total = d.performance.weekly.reduce((n, x) => n + x.done, 0);

  return (
    <section
      aria-label={w.title}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <h2 className="text-base font-semibold">📈 {w.title}</h2>
      <h3 className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
        {w.weekly} ({total} {t.dash.kpi.tasksDone})
      </h3>
      <ol className="mt-1 flex h-28 items-end gap-1.5" aria-label={w.weekly}>
        {d.performance.weekly.map((x, i) => {
          const last = i === d.performance.weekly.length - 1;
          return (
            <li
              key={x.weekStart}
              className="flex h-full flex-1 flex-col items-center justify-end gap-0.5"
            >
              <span className="text-[11px] font-semibold tabular-nums">{x.done}</span>
              <span
                className={`w-full rounded-t ${last ? 'bg-brand-600' : 'bg-brand-300 dark:bg-brand-700'}`}
                style={{ height: `${Math.max(x.done ? 6 : 2, (x.done / max) * 80)}px` }}
                title={`${w.weekOf} ${dayLabel(x.weekStart)}: ${x.done}`}
              />
              <span className="text-[10px] text-slate-600 dark:text-slate-300">
                {last ? w.thisWeek : dayLabel(x.weekStart).split(' ').slice(-2).join(' ')}
              </span>
            </li>
          );
        })}
      </ol>

      <h3 className="mt-4 text-xs font-semibold text-slate-600 dark:text-slate-300">
        {w.byCategory}
      </h3>
      {cats.length === 0 ? (
        <p className="py-2 text-sm text-slate-600 dark:text-slate-300">{w.noData}</p>
      ) : (
        <ul className="mt-1 space-y-1.5">
          {cats.map((c) => (
            <li key={c.categoryId ?? 'none'} className="text-xs">
              <div className="flex justify-between">
                <span className="inline-flex items-center gap-1">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.name}
                </span>
                <span className="tabular-nums text-slate-600 dark:text-slate-300">
                  {w.doneOf.replace('{d}', String(c.done)).replace('{t}', String(c.open + c.done))}
                </span>
              </div>
              <div
                className="flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                style={{ width: `${((c.open + c.done) / catMax) * 100}%` }}
              >
                <span
                  className="h-full"
                  style={{
                    width: `${(c.done / Math.max(1, c.open + c.done)) * 100}%`,
                    backgroundColor: c.color,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

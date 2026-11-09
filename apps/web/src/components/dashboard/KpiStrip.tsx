import { t } from '../../lib/i18n';
import { trend, type DashboardData } from '../../lib/dashboard';
import { fmtDuration } from '../../lib/planner';

const card =
  'rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800';

/** แถบตัวเลขสำคัญ 4 ช่อง: เดดไลน์เดือนนี้, อัตราเสร็จ, งานค้าง, สัปดาห์นี้ (สตรีค) — ทุกตัวมีข้อความ ไม่พึ่งสีอย่างเดียว */
export default function KpiStrip({ d, onOverdue }: { d: DashboardData; onOverdue: () => void }) {
  const k = t.dash.kpi;
  const left = d.deadlines.open;
  const total = d.deadlines.open + d.deadlines.done;
  const tr = trend(d.performance.doneThisWeek, d.performance.doneLastWeek);
  return (
    <section aria-label={k.title} className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <div className={card}>
        <p className="text-xs text-slate-600 dark:text-slate-300">{k.deadlines}</p>
        <p className="text-2xl font-bold tabular-nums">
          {left}
          <span className="text-sm font-normal text-slate-600 dark:text-slate-300">
            {' '}
            / {total} {k.tasks}
          </span>
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-300">{k.deadlinesHint}</p>
      </div>
      <div className={card}>
        <p className="text-xs text-slate-600 dark:text-slate-300">{k.completion}</p>
        <p className="text-2xl font-bold tabular-nums">{d.deadlines.completionRate}%</p>
        <div
          role="progressbar"
          aria-valuenow={d.deadlines.completionRate}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={k.completion}
          className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        >
          <div
            className="h-full bg-brand-600"
            style={{ width: `${d.deadlines.completionRate}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          {d.deadlines.onTimeRate === null ? k.noDone : `${k.onTime} ${d.deadlines.onTimeRate}%`}
        </p>
      </div>
      <button
        type="button"
        onClick={onOverdue}
        disabled={d.attention.overdue === 0}
        className={`${card} text-left ${d.attention.overdue ? 'border-red-300 hover:shadow-md dark:border-red-800' : ''}`}
      >
        <p className="text-xs text-slate-600 dark:text-slate-300">{k.overdue}</p>
        <p
          className={`text-2xl font-bold tabular-nums ${d.attention.overdue ? 'text-red-700 dark:text-red-300' : ''}`}
        >
          {d.attention.overdue ? <span aria-hidden>⚠ </span> : <span aria-hidden>✓ </span>}
          {d.attention.overdue}
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {d.attention.overdue ? k.overdueHint : k.overdueNone}
        </p>
      </button>
      <div className={card}>
        <p className="text-xs text-slate-600 dark:text-slate-300">{k.week}</p>
        <p className="text-2xl font-bold tabular-nums">
          {d.performance.doneThisWeek}
          <span className="text-sm font-normal text-slate-600 dark:text-slate-300">
            {' '}
            {k.tasksDone}
          </span>
        </p>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          <span aria-hidden>{tr.arrow}</span> {k.vsLast.replace('{n}', String(tr.diff))}
          {d.performance.streak > 0 && ` · 🔥 ${d.performance.streak} ${k.streakDays}`}
        </p>
        {d.performance.focusMinutesWeek > 0 && (
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {k.focus} {fmtDuration(d.performance.focusMinutesWeek)}
          </p>
        )}
      </div>
    </section>
  );
}

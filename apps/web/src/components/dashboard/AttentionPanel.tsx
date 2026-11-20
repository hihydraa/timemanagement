import { t } from '../../lib/i18n';
import type { Task } from '../../lib/types';
import type { DashboardData } from '../../lib/dashboard';
import { CountdownChip } from '../TaskChips';

/** ควรจัดการ: งานเลยกำหนด, งานที่ยังไม่ตั้งวัน, งานที่ถูกเลื่อนบ่อย — แสดงชื่องานกดเปิดป๊อปอัปได้ */
export default function AttentionPanel({
  d,
  onOpen,
  onOverdue,
  onUnscheduled,
}: {
  d: DashboardData;
  onOpen: (t: Task) => void;
  onOverdue: () => void;
  onUnscheduled: () => void;
}) {
  const w = t.dash.attention;
  const a = d.attention;
  const none = !a.overdue && !a.unscheduled && a.stalled.length === 0;
  const btn =
    'rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800';
  const list = (items: Task[], total: number, extra?: (x: Task) => React.ReactNode) => (
    <ul className="mt-1 space-y-1">
      {items.map((x) => (
        <li key={x.id}>
          <button
            type="button"
            onClick={() => onOpen(x)}
            className="flex w-full items-center justify-between gap-2 rounded px-1 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <span className="truncate">{x.title}</span>
            <span className="shrink-0 text-xs text-slate-600 dark:text-slate-300">
              {extra?.(x)}
            </span>
          </button>
        </li>
      ))}
      {total > items.length && (
        <li className="px-1 text-xs text-slate-600 dark:text-slate-300">
          {w.more.replace('{n}', String(total - items.length))}
        </li>
      )}
    </ul>
  );
  return (
    <section
      aria-label={w.title}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <h2 className="text-base font-semibold">🧭 {w.title}</h2>
      {none ? (
        <p className="py-3 text-center text-sm text-slate-600 dark:text-slate-300">✓ {w.none}</p>
      ) : (
        <ul className="mt-2 space-y-3 text-sm">
          {a.overdue > 0 && (
            <li>
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span aria-hidden>⚠ </span>
                  {w.overdue.replace('{n}', String(a.overdue))}
                </span>
                <button type="button" className={btn} onClick={onOverdue}>
                  {w.manage}
                </button>
              </div>
              {list(a.overdueTasks, a.overdue, (x) => (
                <CountdownChip task={x} />
              ))}
            </li>
          )}
          {a.unscheduled > 0 && (
            <li>
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span aria-hidden>📥 </span>
                  {w.unscheduled.replace('{n}', String(a.unscheduled))}
                </span>
                <button type="button" className={btn} onClick={onUnscheduled}>
                  {w.schedule}
                </button>
              </div>
              {list(a.unscheduledTasks, a.unscheduled)}
            </li>
          )}
          {a.stalled.length > 0 && (
            <li>
              <p>
                <span aria-hidden>🔁 </span>
                {w.stalled}
              </p>
              {list(a.stalled, a.stalled.length, (x) =>
                w.snoozed.replace('{n}', String(x.snoozeCount)),
              )}
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{w.stalledHint}</p>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

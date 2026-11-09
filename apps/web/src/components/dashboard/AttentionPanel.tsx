import { t } from '../../lib/i18n';
import type { Task } from '../../lib/types';
import type { DashboardData } from '../../lib/dashboard';

/** ควรจัดการ: งานที่ถูกเลื่อนบ่อย, งานค้าง, งานที่ยังไม่ตั้งวัน */
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
  return (
    <section
      aria-label={w.title}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <h2 className="text-base font-semibold">🧭 {w.title}</h2>
      {none ? (
        <p className="py-3 text-center text-sm text-slate-600 dark:text-slate-300">✓ {w.none}</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {a.overdue > 0 && (
            <li className="flex items-center justify-between gap-2">
              <span>
                <span aria-hidden>⚠ </span>
                {w.overdue.replace('{n}', String(a.overdue))}
              </span>
              <button type="button" className={btn} onClick={onOverdue}>
                {w.manage}
              </button>
            </li>
          )}
          {a.unscheduled > 0 && (
            <li className="flex items-center justify-between gap-2">
              <span>
                <span aria-hidden>📥 </span>
                {w.unscheduled.replace('{n}', String(a.unscheduled))}
              </span>
              <button type="button" className={btn} onClick={onUnscheduled}>
                {w.schedule}
              </button>
            </li>
          )}
          {a.stalled.length > 0 && (
            <li>
              <p className="mb-1">
                <span aria-hidden>🔁 </span>
                {w.stalled}
              </p>
              <ul className="space-y-1">
                {a.stalled.map((x) => (
                  <li key={x.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(x)}
                      className="flex w-full items-center justify-between gap-2 text-left hover:underline"
                    >
                      <span className="truncate">{x.title}</span>
                      <span className="shrink-0 text-xs text-slate-600 dark:text-slate-300">
                        {w.snoozed.replace('{n}', String(x.snoozeCount))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{w.stalledHint}</p>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

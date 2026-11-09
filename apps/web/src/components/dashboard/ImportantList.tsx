import { addDaysYmd } from '../../lib/dates';
import { t } from '../../lib/i18n';
import { deadlineYmd } from '../../lib/dashboard';
import type { Task } from '../../lib/types';
import { CountdownChip, ImportanceChip, UrgencyText } from '../TaskChips';
import { URGENCY_COLORS } from '../../lib/colors';

/** งานสำคัญที่ต้องทำ (importance ≥ 3, เรียงตามคะแนน): งานที่ยังไม่ตั้งวันมีปุ่มจัดลงวันนี้/พรุ่งนี้ในคลิกเดียว */
export default function ImportantList({
  tasks,
  today,
  onOpen,
  onComplete,
  onSchedule,
}: {
  tasks: Task[];
  today: string;
  onOpen: (t: Task) => void;
  onComplete: (t: Task) => void;
  onSchedule: (t: Task, ymd: string) => void;
}) {
  const w = t.dash.important;
  const btn =
    'rounded-full border border-slate-300 px-2.5 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800';
  return (
    <section
      aria-label={w.title}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <h2 className="text-base font-semibold">⭐ {w.title}</h2>
      <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{w.hint}</p>
      {tasks.length === 0 ? (
        <p className="py-3 text-center text-sm text-slate-600 dark:text-slate-300">{w.empty}</p>
      ) : (
        <ol className="space-y-2">
          {tasks.map((x, i) => {
            const d = deadlineYmd(x) ?? (x.startAt ? null : null);
            const unscheduled = !x.startAt && !x.dueAt && !x.dueDate;
            return (
              <li
                key={x.id}
                className="flex items-start gap-2 border-l-4 pl-2"
                style={{ borderLeftColor: URGENCY_COLORS[x.urgency] }}
              >
                <span className="mt-0.5 w-4 text-xs tabular-nums text-slate-600 dark:text-slate-300">
                  {i + 1}.
                </span>
                <input
                  type="checkbox"
                  aria-label={`${t.today.complete}: ${x.title}`}
                  className="mt-1 h-4 w-4 accent-brand-600"
                  onChange={() => onComplete(x)}
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onOpen(x)}
                    className="block w-full text-left"
                  >
                    <UrgencyText level={x.urgency} />
                    <span className="block truncate text-sm font-medium">{x.title}</span>
                  </button>
                  <span className="flex flex-wrap items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                    <ImportanceChip level={x.importance} />
                    <CountdownChip task={x} />
                    {d && d < today && <span>{w.late}</span>}
                    {unscheduled && <span>{w.unscheduled}</span>}
                  </span>
                  {unscheduled && (
                    <span className="mt-1 flex gap-1.5">
                      <button type="button" className={btn} onClick={() => onSchedule(x, today)}>
                        {t.form2.today}
                      </button>
                      <button
                        type="button"
                        className={btn}
                        onClick={() => onSchedule(x, addDaysYmd(today, 1))}
                      >
                        {t.form2.tomorrow}
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

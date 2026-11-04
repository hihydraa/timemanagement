import { useApp } from '../../lib/appContext';
import { fmtDuration, type NextUp } from '../../lib/planner';
import { t } from '../../lib/i18n';
import type { Task } from '../../lib/types';
import { CountdownChip, ImportanceChip, UrgencyText } from '../TaskChips';
import { URGENCY_COLORS } from '../../lib/colors';

/** การ์ด "ทำต่อไป": งานที่คะแนนสูงสุดตอนนี้ + ปุ่มเริ่มโฟกัส/เสร็จ/เลื่อน (+ แจ้งนัดที่ใกล้ถึง) */
export default function NextUpCard({
  next,
  appointment,
  onFocus,
  onDone,
  onSnooze,
  onOpen,
  onAdd,
  onInbox,
}: {
  next: NextUp | null;
  appointment: { task: Task; minutes: number } | null;
  onFocus: (t: Task) => void;
  onDone: (t: Task) => void;
  onSnooze: (t: Task) => void;
  onOpen: (t: Task) => void;
  onAdd: () => void;
  onInbox: () => void;
}) {
  const { categories } = useApp();
  const btn =
    'rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700';
  if (!next) {
    return (
      <section
        aria-label={t.cockpit.nextUp}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
          {t.cockpit.nextUp}
        </h2>
        <p className="mt-1 font-medium">{t.cockpit.nextUpEmpty}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.cockpit.nextUpEmptyHint}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onAdd} className={btn}>
            + {t.cockpit.addTask}
          </button>
          <button type="button" onClick={onInbox} className={btn}>
            {t.cockpit.openInbox}
          </button>
        </div>
      </section>
    );
  }
  const task = next.task as Task;
  const cat = categories.find((c) => c.id === task.categoryId);
  return (
    <section
      aria-label={t.cockpit.nextUp}
      className="rounded-2xl border border-l-8 border-slate-200 bg-white p-4 shadow-md dark:border-slate-700 dark:bg-slate-800"
      style={{ borderLeftColor: URGENCY_COLORS[task.urgency] }}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
        {t.cockpit.nextUp} · {t.cockpit.reason[next.reason]}
      </h2>
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="mt-1 block w-full text-left text-xl font-bold leading-snug hover:underline"
        data-testid="next-up-title"
      >
        {task.title}
      </button>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <UrgencyText level={task.urgency} />
        {cat && (
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: cat.color }}
            />
            {cat.name}
          </span>
        )}
        <span>
          {t.cockpit.estimate} {fmtDuration(task.estimateMinutes ?? 30)}
        </span>
        <ImportanceChip level={task.importance} />
        <CountdownChip task={task} />
      </div>
      {appointment && (
        <p role="status" className="mt-2 rounded-lg bg-amber-100 px-2 py-1 text-sm text-amber-950">
          ⏰ {t.cockpit.appointmentSoon.replace('{m}', String(appointment.minutes))} —{' '}
          {appointment.task.title}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onFocus(task)}
          className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          ▶ {t.cockpit.startFocus}
        </button>
        <button type="button" onClick={() => onDone(task)} className={btn}>
          ✓ {t.cockpit.markDone}
        </button>
        <button type="button" onClick={() => onSnooze(task)} className={btn}>
          {t.cockpit.snooze}
        </button>
      </div>
    </section>
  );
}

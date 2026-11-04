import { URGENCY_COLORS } from '../../lib/colors';
import { minToHm, type TimelineEntry } from '../../lib/planner';
import { t } from '../../lib/i18n';
import type { Task } from '../../lib/types';
import { CountdownChip, ImportanceChip, UrgencyText } from '../TaskChips';

/**
 * Timeline แนวตั้งของวัน: เรียงตามเวลา มีเส้น "ตอนนี้" ช่วงเวลาที่ผ่านไปแล้วจางลง
 * และ "ช่วงว่าง" (≥ 45 นาที) กดเพื่อสร้างงานลงช่วงนั้น
 */
export default function DayTimeline({
  entries,
  onOpen,
  onGap,
}: {
  entries: TimelineEntry[];
  onOpen: (t: Task) => void;
  onGap: (startMin: number, endMin: number) => void;
}) {
  const hasItem = entries.some((e) => e.kind === 'item');
  return (
    <ol className="space-y-1.5" aria-label={t.cockpit.timeline}>
      {!hasItem && (
        <li className="px-1 text-sm text-slate-600 dark:text-slate-300">{t.cockpit.noTimed}</li>
      )}
      {entries.map((e, i) => {
        if (e.kind === 'now') {
          return (
            <li
              key={`now${i}`}
              aria-label={`${t.cockpit.now} ${minToHm(e.min)}`}
              className="flex items-center gap-2"
              data-testid="now-line"
            >
              <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-brand-700 dark:text-brand-300">
                {minToHm(e.min)}
              </span>
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" />
              <span className="h-0.5 flex-1 bg-brand-600" />
              <span className="rounded-full bg-brand-600 px-2 text-[11px] font-medium text-white">
                {t.cockpit.now}
              </span>
            </li>
          );
        }
        if (e.kind === 'gap') {
          return (
            <li key={`gap${i}`} className="flex items-center gap-2">
              <span className="w-12 shrink-0" />
              <button
                type="button"
                onClick={() => onGap(e.startMin, e.endMin)}
                title={t.cockpit.gapHint}
                className="flex-1 rounded-xl border border-dashed border-slate-300 px-3 py-1.5 text-left text-sm text-slate-600 hover:border-brand-500 hover:bg-brand-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-brand-950"
              >
                {t.cockpit.gap} {minToHm(e.startMin)}–{minToHm(e.endMin)}
                <span className="ml-2 text-xs">+ {t.cockpit.addTask}</span>
              </button>
            </li>
          );
        }
        const task = e.task as Task;
        const finished = task.status === 'done';
        return (
          <li key={task.id} className="flex items-stretch gap-2">
            <span className="w-12 shrink-0 pt-2 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
              {e.point ? '⚑ ' : ''}
              {minToHm(e.startMin)}
            </span>
            <button
              type="button"
              onClick={() => onOpen(task)}
              className={`min-w-0 flex-1 rounded-xl border border-l-4 border-slate-200 px-3 py-2 text-left shadow-sm hover:shadow-md dark:border-slate-700 ${e.past && !finished ? 'bg-slate-100 dark:bg-slate-900' : 'bg-white dark:bg-slate-800'}`}
              style={{ borderLeftColor: URGENCY_COLORS[task.urgency] }}
            >
              <UrgencyText level={task.urgency} />
              <span
                className={`block truncate text-sm font-medium ${finished ? 'line-through' : ''}`}
              >
                {finished && <span aria-hidden>✓ </span>}
                {task.title}
              </span>
              <span className="flex flex-wrap items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                {!e.point && (
                  <span className="tabular-nums">
                    {minToHm(e.startMin)}–{minToHm(e.endMin)}
                  </span>
                )}
                {e.past && !finished && <span>· {t.cockpit.pastDim}</span>}
                <ImportanceChip level={task.importance} />
                <CountdownChip task={task} />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

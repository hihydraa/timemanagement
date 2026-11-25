import { useMemo, useState } from 'react';
import { dayLabel } from '../../lib/dates';
import {
  heatLevel,
  monthGrid,
  monthTitle,
  shiftMonth,
  deadlineYmd,
  type DashboardData,
} from '../../lib/dashboard';
import { STYLE, kindTh } from '../../lib/daysOffStyle';
import { t } from '../../lib/i18n';
import type { Task } from '../../lib/types';
import { CountdownChip, ImportanceChip, UrgencyText } from '../TaskChips';
import { URGENCY_COLORS } from '../../lib/colors';

/** สีตามความหนาแน่น (ไล่ระดับเขียวแบรนด์ แยกชัดทั้งโหมดสว่าง/มืด; ไม่พึ่งสีอย่างเดียว: มีจุดนับงานและตัวเลขใน aria-label ด้วย) */
const HEAT = [
  'bg-cool-100 dark:bg-slate-900',
  'bg-brand-200 text-brand-950 dark:bg-brand-700 dark:text-white',
  'bg-brand-400 text-brand-950 dark:bg-brand-500 dark:text-white',
  'bg-brand-700 text-white dark:bg-brand-300 dark:text-brand-950',
];

/** เดดไลน์ทั้งเดือน: ปฏิทินความหนาแน่น (กดวันเพื่อกรอง) + รายการเรียงตามวัน */
export default function MonthDeadlines({
  d,
  month,
  onMonth,
  onOpen,
  onComplete,
}: {
  d: DashboardData;
  month: string;
  onMonth: (m: string) => void;
  onOpen: (t: Task) => void;
  onComplete: (t: Task) => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const grid = useMemo(() => monthGrid(month), [month]);
  const offByDate = useMemo(() => new Map(d.leave.month.map((x) => [x.date, x])), [d.leave.month]);
  const w = t.dash.month;
  const shown = pick ? d.deadlines.tasks.filter((x) => deadlineYmd(x) === pick) : d.deadlines.tasks;
  const groups = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const x of shown) m.set(deadlineYmd(x) ?? '', [...(m.get(deadlineYmd(x) ?? '') ?? []), x]);
    return [...m];
  }, [shown]);
  const btn =
    'rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-cool-100 dark:border-slate-600 dark:hover:bg-slate-800';

  return (
    <section
      aria-label={w.title}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{w.title}</h2>
        <span className="flex-1" />
        <button
          type="button"
          className={btn}
          aria-label={w.prev}
          onClick={() => {
            setPick(null);
            onMonth(shiftMonth(month, -1));
          }}
        >
          ‹
        </button>
        <strong className="min-w-24 text-center text-sm">{monthTitle(month)}</strong>
        <button
          type="button"
          className={btn}
          aria-label={w.next}
          onClick={() => {
            setPick(null);
            onMonth(shiftMonth(month, 1));
          }}
        >
          ›
        </button>
        {month !== d.today.slice(0, 7) && (
          <button
            type="button"
            className={btn}
            onClick={() => {
              setPick(null);
              onMonth(d.today.slice(0, 7));
            }}
          >
            {w.thisMonth}
          </button>
        )}
      </div>

      <div role="group" aria-label={w.heat} className="mb-3">
        <div
          aria-hidden
          className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-600 dark:text-slate-300"
        >
          {t.work.dayNames.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
        {grid.map((row, i) => (
          <div key={i} className="mt-1 grid grid-cols-7 gap-1">
            {row.map((c, j) => {
              if (!c.ymd) return <span key={j} aria-hidden />;
              const n = d.deadlines.perDay[c.ymd] ?? { open: 0, done: 0 };
              const total = n.open + n.done;
              const late = n.open > 0 && c.ymd < d.today;
              const isToday = c.ymd === d.today;
              const off = offByDate.get(c.ymd);
              return (
                <button
                  key={j}
                  type="button"
                  aria-pressed={pick === c.ymd}
                  aria-label={`${dayLabel(c.ymd)}: ${total ? w.cellLabel.replace('{o}', String(n.open)).replace('{d}', String(n.done)) : w.noDeadline}${late ? ` (${w.late})` : ''}${off ? ` — ${t.dash.leave.cellOff}: ${kindTh(off.kind)}` : ''}`}
                  disabled={total === 0}
                  onClick={() => setPick(pick === c.ymd ? null : c.ymd)}
                  className={`relative flex h-11 flex-col items-center justify-center rounded-lg text-xs tabular-nums ${HEAT[heatLevel(total)]} ${isToday ? 'ring-2 ring-brand-600' : ''} ${pick === c.ymd ? 'outline outline-2 outline-offset-1 outline-slate-900 dark:outline-white' : ''} ${late ? 'border border-red-500' : 'border border-transparent'}`}
                >
                  {off && (
                    <span
                      aria-hidden
                      title={`${t.dash.leave.cellOff}: ${kindTh(off.kind)}`}
                      className={`absolute right-0.5 top-0.5 rounded px-0.5 text-[9px] leading-none ${STYLE[off.kind].cls}`}
                    >
                      {STYLE[off.kind].icon}
                    </span>
                  )}
                  <span className={isToday ? 'font-bold' : ''}>{c.day}</span>
                  {total > 0 && (
                    <span aria-hidden className="mt-0.5 flex h-2 items-center gap-px leading-none">
                      {late && <span className="mr-0.5 text-[10px]">⚠</span>}
                      {Array.from({ length: Math.min(total, 5) }, (_, k) => (
                        <span
                          key={k}
                          className={`h-1.5 w-1.5 rounded-full border border-current ${k < n.open ? 'bg-current' : ''}`}
                        />
                      ))}
                      {total > 5 && <span className="ml-0.5 text-[9px]">+</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        <ul
          aria-label={w.levelsTitle}
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-700 dark:text-slate-200"
        >
          {w.levels.map((label, k) => (
            <li key={label} className="flex items-center gap-1">
              <span
                aria-hidden
                className={`inline-block h-3.5 w-3.5 rounded ${HEAT[k]} border border-slate-300 dark:border-slate-600`}
              />
              {label}
            </li>
          ))}
          <li>{w.dots}</li>
          <li>{w.dotsDone}</li>
          <li>{w.dotsLate}</li>
        </ul>
        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{w.legend}</p>
      </div>

      {d.deadlines.truncated && (
        <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">{w.truncated}</p>
      )}
      {pick && (
        <p className="mb-1 flex items-center gap-2 text-sm">
          <strong>{dayLabel(pick)}</strong>
          <button type="button" className={btn} onClick={() => setPick(null)}>
            {w.showAll}
          </button>
        </p>
      )}
      {groups.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-600 dark:text-slate-300">{w.empty}</p>
      ) : (
        <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
          {groups.map(([ymd, list]) => (
            <li key={ymd}>
              <h3
                className={`mb-1 text-xs font-semibold ${ymd < d.today ? 'text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-300'}`}
              >
                {ymd < d.today && <span aria-hidden>⚠ </span>}
                {ymd === d.today ? `${t.form2.today} · ` : ''}
                {dayLabel(ymd)}
                {ymd < d.today && ` · ${w.late}`}
              </h3>
              <ul className="space-y-1">
                {list.map((x) => (
                  <li
                    key={x.id}
                    className="flex items-center gap-2 border-l-4 pl-2"
                    style={{ borderLeftColor: URGENCY_COLORS[x.urgency] }}
                  >
                    <input
                      type="checkbox"
                      aria-label={`${t.today.complete}: ${x.title}`}
                      className="h-4 w-4 accent-brand-600"
                      onChange={() => onComplete(x)}
                    />
                    <button
                      type="button"
                      onClick={() => onOpen(x)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <UrgencyText level={x.urgency} />
                      <span className="block truncate text-sm font-medium">{x.title}</span>
                      <span className="flex flex-wrap items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                        <ImportanceChip level={x.importance} />
                        <CountdownChip task={x} />
                        {x.status === 'doing' && <span>{t.status.doing}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

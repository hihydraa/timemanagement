import { useMemo, useState } from 'react';
import { dayLabel } from '../../lib/dates';
import { eventColors } from '../../lib/colors';
import { t } from '../../lib/i18n';
import {
  bkMinute,
  dayLoad,
  deadlineFlagOn,
  minToHm,
  scheduledOn,
  weekDays,
  type DayLoad,
  type WorkHours,
} from '../../lib/planner';
import type { Category, ColorMode, Task } from '../../lib/types';
import { CountdownChip, ImportanceChip, UrgencyText } from '../TaskChips';
import LoadBar from '../today/LoadBar';

export type DropSource = 'card' | 'tray';
export const DND_TYPE = 'application/x-dobby-task';
const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
const SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const dow = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
const sortKey = (x: Task): string =>
  x.allDay || (!x.startAt && !x.dueAt) ? '0' : (x.startAt ?? x.dueAt ?? '0');

interface DayData {
  ymd: string;
  items: Task[];
  flags: Task[];
  load: DayLoad;
}

function timeText(x: Task): string {
  if (x.allDay || (!x.startAt && !x.dueAt)) return '';
  if (x.startAt) {
    const s = bkMinute(x.startAt);
    const e = x.endAt && x.endAt > x.startAt ? bkMinute(x.endAt) : null;
    return e !== null && e !== s ? `${minToHm(s)}–${minToHm(e)}` : minToHm(s);
  }
  return `⚑ ${minToHm(bkMinute(x.dueAt!))}`;
}

function TaskCard({
  task,
  mode,
  catMap,
  onOpen,
  onComplete,
}: {
  task: Task;
  mode: ColorMode;
  catMap: Map<string, Category>;
  onOpen: (t: Task) => void;
  onComplete: (t: Task) => void;
}) {
  const c = eventColors(task, mode, catMap);
  const finished = task.status === 'done' || task.status === 'cancelled';
  const tx = timeText(task);
  return (
    <li
      draggable={!finished}
      onDragStart={(e) => {
        e.dataTransfer.setData(
          DND_TYPE,
          JSON.stringify({ id: task.id, source: 'card' satisfies DropSource }),
        );
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="group relative"
    >
      <button
        type="button"
        onClick={() => onOpen(task)}
        title={`${tx} ${task.title}`.trim()}
        className="block w-full rounded-lg border-l-4 px-2 py-1.5 text-left text-xs shadow-sm hover:shadow-md"
        style={{
          borderLeftColor: c.stripe,
          background: finished ? 'var(--surface-2)' : c.bg,
          color: finished ? 'var(--text-muted)' : c.text,
        }}
      >
        <UrgencyText level={task.urgency} />
        {tx && <span className="block font-semibold tabular-nums">{tx}</span>}
        <span
          className={`line-clamp-2 break-words text-[13px] leading-snug ${finished ? 'line-through' : ''}`}
        >
          {finished && <span aria-hidden>✓ </span>}
          {task.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1">
          <ImportanceChip level={task.importance} />
          <CountdownChip task={task} />
        </span>
      </button>
      {!finished && (
        <input
          type="checkbox"
          aria-label={`${t.today.complete}: ${task.title}`}
          onChange={() => onComplete(task)}
          className="absolute right-1 top-1 h-4 w-4 cursor-pointer accent-brand-600 opacity-0 focus:opacity-100 group-hover:opacity-100"
        />
      )}
    </li>
  );
}

function DayColumn({
  d,
  today,
  mode,
  catMap,
  wide,
  onOpen,
  onAdd,
  onComplete,
  onDropTask,
}: {
  d: DayData;
  today: string;
  mode: ColorMode;
  catMap: Map<string, Category>;
  wide?: boolean;
  onOpen: (t: Task) => void;
  onAdd: (day: string) => void;
  onComplete: (t: Task) => void;
  onDropTask: (id: string, day: string, source: DropSource) => void;
}) {
  const [over, setOver] = useState(false);
  const isToday = d.ymd === today;
  return (
    <section
      aria-label={`${DAY_NAMES[dow(d.ymd)]} ${dayLabel(d.ymd)}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_TYPE)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const raw = e.dataTransfer.getData(DND_TYPE);
        if (!raw) return;
        e.preventDefault();
        try {
          const v = JSON.parse(raw) as { id: string; source: DropSource };
          onDropTask(v.id, d.ymd, v.source);
        } catch {
          /* ข้อมูลลากไม่ถูกต้อง */
        }
      }}
      className={`flex min-w-0 flex-col rounded-xl border bg-white p-2 dark:bg-slate-800 ${over ? 'border-brand-600 ring-2 ring-brand-300' : 'border-slate-200 dark:border-slate-700'} ${isToday ? 'bg-amber-50/60 dark:bg-slate-800' : ''}`}
    >
      <header className="mb-2 space-y-1">
        <div className="flex items-start justify-between gap-1">
          <div className="leading-tight">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {DAY_NAMES[dow(d.ymd)]}
            </p>
            <p
              className={`mt-0.5 inline-flex min-w-9 items-center justify-center rounded-full px-1.5 text-sm font-semibold tabular-nums ${isToday ? 'bg-brand-600 text-white' : ''}`}
            >
              {Number(d.ymd.slice(8))}/{Number(d.ymd.slice(5, 7))}
            </p>
          </div>
          <button
            type="button"
            aria-label={`${t.cal.add} ${dayLabel(d.ymd)}`}
            onClick={() => onAdd(d.ymd)}
            className="h-7 w-7 rounded-full border border-slate-300 text-base leading-none hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            +
          </button>
        </div>
        <LoadBar load={d.load} compact />
        <p className="text-[11px] text-slate-600 dark:text-slate-300">
          {t.cal.count.replace('{n}', String(d.items.length))}
        </p>
      </header>
      <ul className={`flex-1 space-y-1.5 ${wide ? '' : 'min-h-16'}`}>
        {d.items.length === 0 && d.flags.length === 0 && (
          <li className="px-1 text-[11px] text-slate-500 dark:text-slate-400">{t.cal.empty}</li>
        )}
        {d.items.map((x) => (
          <TaskCard
            key={x.id}
            task={x}
            mode={mode}
            catMap={catMap}
            onOpen={onOpen}
            onComplete={onComplete}
          />
        ))}
        {d.flags.map((x) => (
          <li key={`${x.id}#flag`}>
            <button
              type="button"
              onClick={() => onOpen(x)}
              title={`${t.cal.flag}: ${x.title}`}
              className="flex w-full items-start gap-1 rounded-lg border border-dashed border-red-400 bg-red-50 px-2 py-1 text-left text-[11px] text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
            >
              <span aria-hidden>⚑</span>
              <span className="min-w-0">
                <span className="block font-semibold">
                  {t.cal.flag}
                  {x.dueAt ? ` ${minToHm(bkMinute(x.dueAt))}` : ''}
                </span>
                <span className="line-clamp-2 break-words">{x.title}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Week Planner: 7 คอลัมน์ต่อวัน (เดสก์ท็อป) / แถบเลือกวัน + agenda รายวัน (มือถือ)
 * หัวคอลัมน์มีแถบภาระงาน (Load Bar), รายการเรียงตามเวลา, ธงเดดไลน์ที่วันครบกำหนด; ลากการ์ด/งานจากถาดมาวางที่วันได้
 */
export default function WeekCards({
  weekStart,
  tasks,
  work,
  today,
  mode,
  catMap,
  isMobile,
  selectedDay,
  onSelectDay,
  onOpen,
  onAdd,
  onComplete,
  onDropTask,
}: {
  weekStart: string;
  tasks: Task[];
  work: WorkHours;
  today: string;
  mode: ColorMode;
  catMap: Map<string, Category>;
  isMobile: boolean;
  selectedDay: string;
  onSelectDay: (d: string) => void;
  onOpen: (t: Task) => void;
  onAdd: (day: string) => void;
  onComplete: (t: Task) => void;
  onDropTask: (id: string, day: string, source: DropSource) => void;
}) {
  const days: DayData[] = useMemo(
    () =>
      weekDays(weekStart).map((ymd) => {
        const items = tasks
          .filter((x) => scheduledOn(x, ymd))
          .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
        return {
          ymd,
          items,
          flags: tasks.filter((x) => deadlineFlagOn(x, ymd)),
          load: dayLoad(ymd, work, items),
        };
      }),
    [tasks, weekStart, work],
  );

  if (isMobile) {
    const cur = days.find((d) => d.ymd === selectedDay) ?? days[0]!;
    return (
      <div className="space-y-3">
        <div role="tablist" aria-label={t.cal.weekOf} className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const on = d.ymd === cur.ymd;
            return (
              <button
                key={d.ymd}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onSelectDay(d.ymd)}
                className={`flex flex-col items-center rounded-xl border px-0.5 py-1.5 text-xs ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'} ${d.ymd === today && !on ? 'ring-2 ring-amber-400' : ''}`}
              >
                <span>{SHORT[dow(d.ymd)]}</span>
                <span className="text-sm font-semibold tabular-nums">{Number(d.ymd.slice(8))}</span>
                <span
                  aria-hidden
                  className="mt-0.5 h-1.5 w-6 rounded-full"
                  style={{
                    background:
                      d.load.status === 'off' ? 'var(--border)' : `var(--load-${d.load.status})`,
                  }}
                />
                <span className="text-[10px] tabular-nums">{d.items.length}</span>
                {/* รายละเอียดสำหรับ screen reader (ชื่อที่อ่านต้องรวมข้อความที่มองเห็น) */}
                <span className="sr-only">
                  {' '}
                  {DAY_NAMES[dow(d.ymd)]} {dayLabel(d.ymd)} ·{' '}
                  {t.cal.count.replace('{n}', String(d.items.length))} ·{' '}
                  {t.cockpit.loadStatus[d.load.status]}
                </span>
              </button>
            );
          })}
        </div>
        <DayColumn
          d={cur}
          today={today}
          mode={mode}
          catMap={catMap}
          wide
          onOpen={onOpen}
          onAdd={onAdd}
          onComplete={onComplete}
          onDropTask={onDropTask}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-7 gap-2" data-testid="week-cards">
      {days.map((d) => (
        <DayColumn
          key={d.ymd}
          d={d}
          today={today}
          mode={mode}
          catMap={catMap}
          onOpen={onOpen}
          onAdd={onAdd}
          onComplete={onComplete}
          onDropTask={onDropTask}
        />
      ))}
    </div>
  );
}

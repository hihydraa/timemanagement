import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DayTimeline from '../components/today/DayTimeline';
import InsightBar from '../components/today/InsightBar';
import NextUpCard from '../components/today/NextUpCard';
import ProgressRing from '../components/today/ProgressRing';
import { CountdownChip, ImportanceChip, UrgencyText } from '../components/TaskChips';
import Mascot from '../components/Mascot';
import { api, ApiClientError } from '../lib/api';
import { useApp } from '../lib/appContext';
import { URGENCY_COLORS } from '../lib/colors';
import { dayLabel } from '../lib/dates';
import { t } from '../lib/i18n';
import {
  buildTimeline,
  dayLoad,
  bkMinute,
  insight as buildInsight,
  nextUp,
  upcomingAppointment,
  minToHm,
} from '../lib/planner';
import type { DrawerInit } from '../components/TaskDrawer';
import type { CockpitData, Task } from '../lib/types';

const TaskDrawer = lazy(() => import('../components/TaskDrawer'));
export const FOCUS_TASK_KEY = 'dobby.focusTask';

const REFRESH_MS = 5 * 60_000;

function useNowMs(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const greeting = (hour: number) =>
  t.cockpit.greet[hour < 5 ? 3 : hour < 12 ? 0 : hour < 17 ? 1 : hour < 21 ? 2 : 3];

/** หน้า "วันนี้" (Today Cockpit): ตอบว่า "ตอนนี้ควรทำอะไร" และ "วันนี้ทำไหวไหม" */
export default function TodayPage() {
  const { categories, gcalAvailable, goTo } = useApp();
  const [data, setData] = useState<CockpitData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drawer, setDrawer] = useState<DrawerInit | null>(null);
  const nowMs = useNowMs();
  const timelineRef = useRef<HTMLElement>(null);

  const load = useCallback(() => {
    api
      .cockpit()
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e instanceof ApiClientError ? e.message : t.cockpit.loadFailed));
  }, []);
  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const now = useMemo(() => new Date(nowMs), [nowMs]);

  const view = useMemo(() => {
    if (!data) return null;
    const scheduled = [...data.today, ...data.dueToday, ...data.doneToday];
    const open = [...data.overdue, ...data.dueToday, ...data.today];
    const load = dayLoad(data.date, data.work, scheduled);
    const ins = buildInsight({
      today: data.date,
      tasks: scheduled,
      overdueCount: data.overdue.length,
      load,
    });
    const next = nextUp(open, now, { today: data.date });
    const soon = upcomingAppointment(open, now, 30, next?.task.id);
    const timeline = buildTimeline(scheduled, data.date, data.work, now);
    const untimed = scheduled.filter((x) => (!x.allDay ? !x.startAt && !x.dueAt : true));
    return {
      scheduled,
      load,
      ins,
      next,
      soon,
      timeline,
      untimed,
      total: data.today.length + data.dueToday.length + data.doneToday.length,
    };
  }, [data, now]);

  const complete = (task: Task) =>
    void api
      .completeTask(task.id)
      .then(load)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : t.error.generic));
  const snoozeTomorrow = (task: Task) =>
    void api
      .snoozeTask(task.id, { days: 1 })
      .then(load)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : t.error.generic));
  const startFocus = (task: Task) => {
    try {
      sessionStorage.setItem(FOCUS_TASK_KEY, task.id);
    } catch {
      /* ไม่มี storage ก็แค่ไม่ถูกเลือกล่วงหน้า */
    }
    goTo('focus');
  };
  const addAtGap = (startMin: number, endMin: number) => {
    if (!data) return;
    const end = Math.min(endMin, startMin + 60);
    setDrawer({
      prefill: {
        allDay: false,
        startInput: `${data.date}T${minToHm(startMin)}`,
        endInput: `${data.date}T${minToHm(end)}`,
      },
    });
  };
  const moveAll = async (to: 'today' | 'tomorrow') => {
    try {
      const r = await api.rescheduleOverdue(to);
      setNotice(
        t.cockpit.moved.replace('{n}', String(r.movedIds.length)) +
          (r.hasMore ? t.cockpit.movedMore : ''),
      );
      load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    }
  };

  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok',
    }).format(now),
  );
  const card =
    'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800';

  if (error && !data)
    return (
      <main className="flex flex-col items-center gap-3 py-10 text-center">
        <Mascot pose="idea" height={120} />
        <p role="alert">{error}</p>
        <button
          type="button"
          onClick={load}
          className="rounded-full bg-brand-600 px-4 py-2 text-sm text-white"
        >
          {t.cockpit.retry}
        </button>
      </main>
    );
  if (!data || !view)
    return (
      <main className="space-y-3 py-3" aria-busy="true" role="status" aria-label={t.loading}>
        {[88, 150, 110, 220].map((h) => (
          <div
            key={h}
            className="animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-700/50"
            style={{ height: h }}
          />
        ))}
      </main>
    );

  const openDeadlines = data.dueToday;
  return (
    <main className="space-y-3 py-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{greeting(hour)}</p>
          <h2 className="text-2xl font-bold text-brand-800 dark:text-brand-200">
            {t.cockpit.title} · {dayLabel(data.date)}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setDrawer({ prefill: { allDay: false } })}
          className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          + {t.cockpit.addTask}
        </button>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded bg-brand-50 p-2 text-sm text-brand-800 dark:bg-brand-950 dark:text-brand-100"
        >
          {notice}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <InsightBar
            insight={view.ins}
            load={view.load}
            onAdd={() => setDrawer({ prefill: { allDay: false } })}
            onInbox={() => goTo('inbox')}
            onTimeline={() =>
              timelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          />
          <NextUpCard
            next={view.next}
            appointment={view.soon as { task: Task; minutes: number } | null}
            onFocus={startFocus}
            onDone={complete}
            onSnooze={snoozeTomorrow}
            onOpen={(x) => setDrawer({ task: x })}
            onAdd={() => setDrawer({ prefill: { allDay: false } })}
            onInbox={() => goTo('inbox')}
          />
          <ProgressRing
            done={data.doneToday.length}
            total={view.total}
            focusMinutes={data.focusMinutes}
          />

          {openDeadlines.length > 0 && (
            <section aria-label={t.cockpit.deadlines} className={card}>
              <h2 className="mb-2 text-sm font-semibold">
                ⚑ {t.cockpit.deadlines} ({openDeadlines.length})
              </h2>
              <ul className="space-y-1.5">
                {openDeadlines.map((x) => (
                  <li key={x.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`${t.today.complete}: ${x.title}`}
                      className="h-4 w-4 accent-brand-600"
                      onChange={() => complete(x)}
                    />
                    <button
                      type="button"
                      onClick={() => setDrawer({ task: x })}
                      className="min-w-0 flex-1 text-left"
                    >
                      <UrgencyText level={x.urgency} />
                      <span className="block truncate text-sm font-medium">{x.title}</span>
                      <span className="flex flex-wrap items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                        {x.dueAt && (
                          <span className="tabular-nums">{minToHm(bkMinute(x.dueAt))}</span>
                        )}
                        <ImportanceChip level={x.importance} />
                        <CountdownChip task={x} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.overdue.length > 0 && (
            <section
              aria-label={t.cockpit.overdue}
              className={`${card} border-red-200 dark:border-red-900`}
            >
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                <Mascot pose="deadline" height={32} />
                {t.cockpit.overdue} ({data.overdue.length})
              </h2>
              <ul className="space-y-1.5">
                {data.overdue.map((x) => (
                  <li
                    key={x.id}
                    className="flex items-center gap-2 border-l-4 pl-2"
                    style={{ borderLeftColor: URGENCY_COLORS[x.urgency] }}
                  >
                    <input
                      type="checkbox"
                      aria-label={`${t.today.complete}: ${x.title}`}
                      className="h-4 w-4 accent-brand-600"
                      onChange={() => complete(x)}
                    />
                    <button
                      type="button"
                      onClick={() => setDrawer({ task: x })}
                      className="min-w-0 flex-1 text-left"
                    >
                      <UrgencyText level={x.urgency} />
                      <span className="block truncate text-sm font-medium">{x.title}</span>
                      <span className="flex flex-wrap items-center gap-1 text-xs">
                        <CountdownChip task={x} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void moveAll('today')}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
                >
                  {t.cockpit.moveAllToday}
                </button>
                <button
                  type="button"
                  onClick={() => void moveAll('tomorrow')}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
                >
                  {t.cockpit.moveAllTomorrow}
                </button>
              </div>
            </section>
          )}
        </div>

        <section
          ref={timelineRef}
          aria-label={t.cockpit.timeline}
          className={`${card} scroll-mt-4`}
        >
          <h2 className="mb-3 text-sm font-semibold">{t.cockpit.timeline}</h2>
          <DayTimeline
            entries={view.timeline}
            onOpen={(x) => setDrawer({ task: x })}
            onGap={addAtGap}
          />
          {view.untimed.length > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
              <h3 className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t.cockpit.untimed}
              </h3>
              <ul className="space-y-1.5">
                {view.untimed.map((x) => (
                  <li key={x.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={x.status === 'done'}
                      disabled={x.status === 'done'}
                      aria-label={`${t.today.complete}: ${x.title}`}
                      className="h-4 w-4 accent-brand-600"
                      onChange={() => complete(x)}
                    />
                    <button
                      type="button"
                      onClick={() => setDrawer({ task: x })}
                      className={`min-w-0 flex-1 truncate text-left text-sm ${x.status === 'done' ? 'line-through' : ''}`}
                    >
                      {x.title}
                    </button>
                    <ImportanceChip level={x.importance} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {drawer && (
        <Suspense fallback={null}>
          <TaskDrawer
            key={drawer.task?.id ?? 'new'}
            init={drawer}
            categories={categories}
            gcalAvailable={gcalAvailable}
            onClose={() => setDrawer(null)}
            onSaved={(warning) => {
              setDrawer(null);
              if (warning) setError(warning);
              load();
            }}
            onAttachmentsChanged={load}
            onOpenTask={(x) => setDrawer({ task: x })}
          />
        </Suspense>
      )}
    </main>
  );
}

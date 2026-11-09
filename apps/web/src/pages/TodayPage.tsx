import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DayTimeline from '../components/today/DayTimeline';
import InsightBar from '../components/today/InsightBar';
import NextUpCard from '../components/today/NextUpCard';
import ProgressRing from '../components/today/ProgressRing';
import { CountdownChip, ImportanceChip, UrgencyText } from '../components/TaskChips';
import Mascot from '../components/Mascot';
import ReviewCard from '../components/today/ReviewCard';
import AttentionPanel from '../components/dashboard/AttentionPanel';
import ImportantList from '../components/dashboard/ImportantList';
import KpiStrip from '../components/dashboard/KpiStrip';
import MonthDeadlines from '../components/dashboard/MonthDeadlines';
import PerformancePanel from '../components/dashboard/PerformancePanel';
import WorkloadStrip from '../components/dashboard/WorkloadStrip';
import QuickAdd from '../components/QuickAdd';
import UnscheduledList from '../components/UnscheduledList';
import { api, ApiClientError } from '../lib/api';
import { useApp } from '../lib/appContext';
import { useToast } from '../components/UndoToast';
import { snoozeRevertPayload, TASKS_CHANGED } from '../lib/undo';
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
import type { DashboardData } from '../lib/dashboard';
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
  const { categories, gcalAvailable, goTo, route } = useApp();
  const [data, setData] = useState<CockpitData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drawer, setDrawer] = useState<DrawerInit | null>(null);
  const nowMs = useNowMs();
  const timelineRef = useRef<HTMLElement>(null);
  const toast = useToast();
  const quickRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Task[]>([]);
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [dashKey, setDashKey] = useState(0);
  const [dashError, setDashError] = useState(false);

  const load = useCallback(() => {
    setDashKey((k) => k + 1); // ภาพรวมเดือนโหลดใหม่พร้อมกับข้อมูลวันนี้
    api
      .cockpit()
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e instanceof ApiClientError ? e.message : t.cockpit.loadFailed));
  }, []);
  useEffect(() => void api.trackEvent('morning_plan_opened'), []);
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

  useEffect(() => {
    let alive = true;
    api
      .dashboard(month)
      .then((d) => {
        if (!alive) return;
        setDash(d);
        setDashError(false);
      })
      .catch(() => alive && setDashError(true));
    return () => {
      alive = false;
    };
  }, [month, dashKey]);

  const now = useMemo(() => new Date(nowMs), [nowMs]);

  const view = useMemo(() => {
    if (!data) return null;
    const mine = pending.filter((x) => (x.dueDate ?? x.startAt?.slice(0, 10)) === data.date);
    const scheduled = [...data.today, ...mine, ...data.dueToday, ...data.doneToday];
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
  }, [data, now, pending]);

  const scrollToOverdue = () =>
    document
      .getElementById('overdue-section')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const schedule = (task: Task, ymd: string) =>
    void api.updateTask(task.id, { allDay: true, dueDate: ymd }).then(load).catch(fail);
  const scrollToUnscheduled = () =>
    document.getElementById('unscheduled')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // ปุ่ม + (FAB) / ลิงก์เก่า /inbox: เปิดฟอร์มเพิ่มงาน หรือเลื่อนไปส่วน "ยังไม่จัดเวลา" หลังข้อมูลโหลด
  const wantFocus = useRef(false);
  const focusQuick = useCallback(() => {
    const el = quickRef.current;
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    return true;
  }, []);
  const openNew = useCallback(() => {
    try {
      sessionStorage.removeItem('dobby.openNew'); // ใช้แล้วทิ้ง ไม่ให้รีโหลดแล้วเด้งซ้ำ
    } catch {
      /* ไม่มี storage */
    }
    if (!focusQuick()) wantFocus.current = true; // ช่องพิมพ์ยังไม่ขึ้น (กำลังโหลด) → โฟกัสทันทีที่พร้อม
  }, [focusQuick]);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('dobby.openNew') === '1') openNew();
    } catch {
      /* ไม่มี storage */
    }
    window.addEventListener('dobby:new-task', openNew);
    // คีย์ลัด: n = เพิ่มงาน, / = ไปที่ช่องพิมพ์ (ไม่ทำงานตอนกำลังพิมพ์)
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      if (e.key === 'n' || e.key === '/') {
        e.preventDefault();
        openNew();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(TASKS_CHANGED, load);
    return () => {
      window.removeEventListener(TASKS_CHANGED, load);
      window.removeEventListener('dobby:new-task', openNew);
      window.removeEventListener('keydown', onKey);
    };
  }, [openNew, load]);
  const anchor = route.anchor;
  const loaded = !!data;
  useEffect(() => {
    if (loaded && wantFocus.current && focusQuick()) wantFocus.current = false;
  }, [loaded, focusQuick]);
  useEffect(() => {
    if (anchor === 'unscheduled' && loaded) {
      const id = window.setTimeout(scrollToUnscheduled, 150);
      return () => window.clearTimeout(id);
    }
  }, [anchor, loaded]);

  const fail = (e: unknown) => setError(e instanceof ApiClientError ? e.message : t.error.generic);
  const complete = (task: Task) =>
    void api
      .completeTask(task.id)
      .then(() => {
        load();
        toast.undo(`${t.toast.done}: ${task.title}`, async () => {
          await api.updateTask(task.id, { status: task.status === 'done' ? 'todo' : task.status });
          load();
        });
      })
      .catch(fail);
  const snoozeTomorrow = (task: Task) =>
    void api
      .snoozeTask(task.id, { days: 1 })
      .then(() => {
        load();
        toast.undo(`${t.toast.snoozed}: ${task.title}`, async () => {
          await api.updateTask(task.id, snoozeRevertPayload(task));
          load();
        });
      })
      .catch(fail);
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
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Mascot pose="idea" height={120} />
        <p role="alert">{error}</p>
        <button
          type="button"
          onClick={load}
          className="rounded-full bg-brand-600 px-4 py-2 text-sm text-white"
        >
          {t.cockpit.retry}
        </button>
      </div>
    );
  if (!data || !view)
    return (
      <div className="space-y-3 py-3" aria-busy="true" role="status" aria-label={t.loading}>
        {[88, 150, 110, 220].map((h) => (
          <div
            key={h}
            className="animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-700/50"
            style={{ height: h }}
          />
        ))}
      </div>
    );

  const openDeadlines = data.dueToday;
  return (
    <div className="space-y-3 py-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{greeting(hour)}</p>
          <h2 className="text-2xl font-bold text-brand-800 dark:text-brand-200">
            {t.dash.title} · {dayLabel(data.date)}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setDrawer({ prefill: { allDay: false } })}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          {t.quick.fullForm}
        </button>
      </header>

      <QuickAdd
        categories={categories}
        inputRef={quickRef}
        onPending={(x) => setPending((p) => [...p, x])}
        onSettled={(id) => setPending((p) => p.filter((x) => x.id !== id))}
        onCreated={load}
      />

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

      <ReviewCard now={now} onOpen={() => goTo('me', 'review')} />

      {dash ? (
        <KpiStrip d={dash} onOverdue={scrollToOverdue} />
      ) : (
        // จองที่ไว้ก่อน กันเนื้อหาเลื่อนลงเมื่อข้อมูลมาถึง (CLS)
        <div
          aria-hidden
          className="h-[104px] rounded-2xl bg-slate-200/60 dark:bg-slate-700/40 lg:h-[96px]"
        />
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <InsightBar
            insight={view.ins}
            load={view.load}
            onAdd={() => setDrawer({ prefill: { allDay: false } })}
            onInbox={scrollToUnscheduled}
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
            onInbox={scrollToUnscheduled}
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
              id="overdue-section"
              aria-label={t.cockpit.overdue}
              className={`${card} scroll-mt-4 border-red-200 dark:border-red-900`}
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

      <h2 className="pt-2 text-lg font-bold text-brand-800 dark:text-brand-200">
        {t.dash.overview}
      </h2>
      {dashError && !dash && (
        <p
          role="alert"
          className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {t.dash.loadFailed}
        </p>
      )}
      {!dash && !dashError && (
        <div aria-hidden className="h-[640px] rounded-2xl bg-slate-200/60 dark:bg-slate-700/40" />
      )}
      {dash && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-3">
            <MonthDeadlines
              d={dash}
              month={dash.month}
              onMonth={setMonth}
              onOpen={(x) => setDrawer({ task: x })}
              onComplete={complete}
            />
          </div>
          <div className="space-y-3">
            <ImportantList
              tasks={dash.important}
              today={dash.today}
              onOpen={(x) => setDrawer({ task: x })}
              onComplete={complete}
              onSchedule={schedule}
            />
            <WorkloadStrip d={dash} onGo={() => goTo('plan')} />
            <AttentionPanel
              d={dash}
              onOpen={(x) => setDrawer({ task: x })}
              onOverdue={scrollToOverdue}
              onUnscheduled={scrollToUnscheduled}
            />
            <PerformancePanel d={dash} />
          </div>
        </div>
      )}

      <UnscheduledList onChanged={load} />

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
    </div>
  );
}

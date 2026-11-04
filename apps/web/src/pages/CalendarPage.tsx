import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core';
import thLocale from '@fullcalendar/core/locales/th';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Filters, { applyFilters, emptyFilters, type FilterState } from '../components/Filters';
import Legend from '../components/Legend';
import TaskDrawer, { type DrawerInit } from '../components/TaskDrawer';
import TodayPanel from '../components/TodayPanel';
import { api, ApiClientError } from '../lib/api';
import { eventColors } from '../lib/colors';
import { t } from '../lib/i18n';
import { addMinutesWall, calDateToIso, calDateToYmd, isoToWall, wallNow } from '../lib/time';
import type { Category, ColorMode, Task, TaskPayload, TodayData, User } from '../lib/types';

const MODE_KEY = 'dobby.colorMode';
const loadMode = (): ColorMode => {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'urgency' || v === 'importance' || v === 'category') return v;
  } catch {
    /* ไม่มี storage ก็ใช้ค่าเริ่มต้น */
  }
  return 'category';
};

function taskToEvent(task: Task, mode: ColorMode, cats: Map<string, Category>): EventInput | null {
  const c = eventColors(task, mode, cats);
  const base = {
    id: task.id,
    title: task.title,
    backgroundColor: c.bg,
    borderColor: c.bg,
    textColor: c.text,
    classNames: task.status === 'done' || task.status === 'cancelled' ? ['dobby-done'] : [],
    extendedProps: {
      stripe: c.stripe,
      urgency: task.urgency,
      importance: task.importance,
      attachmentCount: task.attachmentCount,
    },
  };
  if (task.allDay && task.dueDate) {
    return {
      ...base,
      start: task.dueDate,
      allDay: true,
      durationEditable: false,
      extendedProps: { ...base.extendedProps, kind: 'allday' },
    };
  }
  if (task.startAt) {
    const start = isoToWall(task.startAt);
    const end = task.endAt
      ? isoToWall(task.endAt)
      : addMinutesWall(start, task.estimateMinutes ?? 60);
    return {
      ...base,
      start,
      end,
      allDay: false,
      extendedProps: { ...base.extendedProps, kind: 'timed' },
    };
  }
  if (task.dueAt) {
    const end = isoToWall(task.dueAt);
    return {
      ...base,
      title: `⏰ ${task.title}`,
      start: addMinutesWall(end, -30),
      end,
      allDay: false,
      durationEditable: false,
      extendedProps: { ...base.extendedProps, kind: 'deadline' },
    };
  }
  return null;
}

function renderEvent(arg: EventContentArg) {
  const { stripe, urgency, importance } = arg.event.extendedProps as {
    stripe: string;
    urgency: number;
    importance: number;
  };
  return (
    <div
      className="flex h-full min-w-0 items-start gap-1 overflow-hidden"
      style={{ borderLeft: `5px solid ${stripe}`, paddingLeft: 3 }}
    >
      <div className="min-w-0 flex-1 truncate text-xs leading-tight">
        {arg.timeText && <span className="mr-1 font-semibold">{arg.timeText}</span>}
        <span>{arg.event.title}</span>
        {(arg.event.extendedProps.attachmentCount as number) > 0 && (
          <span role="img" aria-label={t.attach.title} className="ml-1">
            📎
          </span>
        )}
      </div>
      <span
        className="shrink-0 pr-0.5 text-[10px] leading-tight"
        aria-label={`${t.legend.bang} ${urgency} ${t.legend.stars} ${importance}`}
      >
        {'!'.repeat(urgency)}
        <br />
        {'★'.repeat(importance)}
      </span>
    </div>
  );
}

function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia('(max-width: 1023px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const fn = () => setM(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return m;
}

export default function CalendarPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const calRef = useRef<FullCalendar>(null);
  const isMobile = useIsMobile();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [today, setToday] = useState<TodayData | null>(null);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [mode, setModeState] = useState<ColorMode>(loadMode);
  const [drawer, setDrawer] = useState<DrawerInit | null>(null);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const setMode = (m: ColorMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const allTags = useMemo(() => [...new Set(tasks.flatMap((x) => x.tags))].sort(), [tasks]);
  const events = useMemo(
    () =>
      applyFilters(tasks, filters)
        .map((x) => taskToEvent(x, mode, catMap))
        .filter((e): e is EventInput => e !== null),
    [tasks, filters, mode, catMap],
  );

  const loadTasks = useCallback(async () => {
    if (!range) return;
    try {
      setTasks(await api.listTasks(range.from, range.to));
    } catch {
      setError(t.error.loadFailed);
    }
  }, [range]);
  const loadToday = useCallback(
    () =>
      api
        .today()
        .then(setToday)
        .catch(() => setError(t.error.loadFailed)),
    [],
  );
  const loadCategories = useCallback(
    () =>
      api
        .listCategories()
        .then(setCategories)
        .catch(() => setError(t.error.loadFailed)),
    [],
  );

  useEffect(() => void loadTasks(), [loadTasks]);
  useEffect(() => {
    void loadToday();
    void loadCategories();
  }, [loadToday, loadCategories]);

  const refreshAll = useCallback(() => {
    void loadTasks();
    void loadToday();
  }, [loadTasks, loadToday]);

  // FullCalendar อาจเรียก datesSet ซ้ำเมื่อ re-render: ตั้งค่าใหม่เฉพาะเมื่อช่วงเปลี่ยนจริง
  const onDatesSet = useCallback((a: DatesSetArg) => {
    const from = calDateToIso(a.start);
    const to = calDateToIso(a.end);
    setRange((prev) => (prev && prev.from === from && prev.to === to ? prev : { from, to }));
  }, []);

  const onSelect = (info: DateSelectArg) => {
    calRef.current?.getApi().unselect();
    setDrawer({
      prefill: info.allDay
        ? { allDay: true, date: calDateToYmd(info.start) }
        : {
            allDay: false,
            startInput: info.start.toISOString().slice(0, 16),
            endInput: info.end.toISOString().slice(0, 16),
          },
    });
  };

  const onEventClick = (info: EventClickArg) => {
    const task = tasks.find((x) => x.id === info.event.id);
    if (task) setDrawer({ task });
  };

  async function persistMove(info: EventDropArg | EventResizeDoneArg) {
    const ev = info.event;
    const kind = ev.extendedProps.kind as string;
    let patch: TaskPayload;
    if (ev.allDay) {
      patch = { allDay: true, dueDate: calDateToYmd(ev.start!) };
    } else {
      const start = ev.start!;
      const end = ev.end ?? new Date(start.getTime() + 60 * 60_000);
      patch =
        kind === 'deadline'
          ? { allDay: false, dueAt: calDateToIso(end) }
          : { allDay: false, startAt: calDateToIso(start), endAt: calDateToIso(end) };
    }
    try {
      await api.updateTask(ev.id, patch);
      refreshAll();
    } catch (e) {
      info.revert();
      setError(e instanceof ApiClientError ? e.message : t.error.moveFailed);
    }
  }

  const modeBtn = (m: ColorMode) => (
    <button
      key={m}
      type="button"
      aria-pressed={mode === m}
      onClick={() => setMode(m)}
      className={`px-3 py-2 text-sm ${mode === m ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
    >
      {t.colorBy[m]}
    </button>
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <h1 className="mr-auto text-lg font-bold">{t.appName}</h1>
        <div
          role="group"
          aria-label={t.colorBy.label}
          className="flex items-center overflow-hidden rounded border border-slate-300 dark:border-slate-600"
        >
          <span className="px-2 text-xs text-slate-500">{t.colorBy.label}</span>
          {(['category', 'urgency', 'importance'] as ColorMode[]).map(modeBtn)}
        </div>
        <button
          type="button"
          onClick={() => setDrawer({ prefill: { allDay: false } })}
          className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + {t.nav.newTask}
        </button>
        <button
          type="button"
          className="rounded px-3 py-2 text-sm hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
        >
          {showFilters ? t.nav.hideFilters : t.nav.filters}
        </button>
        <button
          type="button"
          title={user.email}
          onClick={() => api.logout().finally(onLogout)}
          className="rounded px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {t.nav.logout}
        </button>
      </header>

      {error && (
        <p
          role="alert"
          className="mx-3 mt-2 flex items-center justify-between rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
          <button
            type="button"
            aria-label={t.form.close}
            onClick={() => setError('')}
            className="px-2"
          >
            ×
          </button>
        </p>
      )}

      <div className="grid flex-1 gap-3 p-3 lg:grid-cols-[16rem_1fr_18rem]">
        <aside className={`${showFilters ? 'block' : 'hidden'} space-y-4 lg:block`}>
          <div>
            <label
              htmlFor="jump"
              className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400"
            >
              {t.nav.jumpTo}
            </label>
            <input
              id="jump"
              type="date"
              onChange={(e) => e.target.value && calRef.current?.getApi().gotoDate(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </div>
          <Filters
            value={filters}
            onChange={setFilters}
            categories={categories}
            allTags={allTags}
          />
          <Legend categories={categories} onChanged={() => void loadCategories()} />
        </aside>

        <main className="min-w-0 order-first lg:order-none">
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            locales={[thLocale]}
            locale="th"
            buttonText={{ list: t.nav.listView }}
            timeZone="UTC"
            now={wallNow}
            nowIndicator
            firstDay={1}
            initialView={isMobile ? 'timeGridDay' : 'timeGridWeek'}
            headerToolbar={
              isMobile
                ? { left: 'prev,next', center: 'title', right: 'today' }
                : {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek',
                  }
            }
            footerToolbar={
              isMobile ? { center: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek' } : false
            }
            height={isMobile ? 'auto' : 'calc(100vh - 7rem)'}
            scrollTime="07:00:00"
            slotEventOverlap={false}
            editable
            selectable
            selectMirror
            dayMaxEvents
            events={events}
            eventContent={renderEvent}
            select={onSelect}
            eventClick={onEventClick}
            eventDrop={persistMove}
            eventResize={persistMove}
            datesSet={onDatesSet}
          />
        </main>

        <aside className="lg:block">
          <TodayPanel data={today} onOpen={(task) => setDrawer({ task })} onChanged={refreshAll} />
        </aside>
      </div>

      {drawer && (
        <TaskDrawer
          init={drawer}
          categories={categories}
          onClose={() => setDrawer(null)}
          onSaved={(warning) => {
            setDrawer(null);
            if (warning) setError(warning);
            refreshAll();
          }}
          onAttachmentsChanged={refreshAll}
        />
      )}
    </div>
  );
}

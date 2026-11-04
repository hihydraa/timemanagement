import type {
  DateSelectArg,
  DatesSetArg,
  DayHeaderContentArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core';
import thLocale from '@fullcalendar/core/locales/th';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, {
  type DropArg,
  type EventResizeDoneArg,
} from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Filters, {
  activeCount,
  applyFilters,
  emptyFilters,
  type FilterState,
} from '../components/Filters';
import Legend from '../components/Legend';
import type { DrawerInit } from '../components/TaskDrawer';
import { api, ApiClientError } from '../lib/api';
import { useApp } from '../lib/appContext';
import { eventColors } from '../lib/colors';
import CalToolbar, { type CalMode } from '../components/calendar/CalToolbar';
import TaskTray from '../components/calendar/TaskTray';
import WeekCards, { type DropSource } from '../components/calendar/WeekCards';
import MiniCalendar from '../components/MiniCalendar';
import Popover from '../components/Popover';
import SidebarCustomize from '../components/SidebarCustomize';
import { t } from '../lib/i18n';
import { CountdownChip, ImportanceChip, UrgencyText } from '../components/TaskChips';
import { addDaysYmd, mondayOf } from '../lib/dates';
import {
  DEFAULT_WORK,
  deadlineFlagOn,
  planDrop,
  planDropAt,
  scheduledOn,
  type WorkHours,
} from '../lib/planner';
import { SIDEBAR_DEFAULT, sortSections } from '../lib/sidebar';
import {
  addMinutesWall,
  calDateToIso,
  calDateToYmd,
  isoToWall,
  isPointInTime,
  todayYmd,
  wallNow,
  wallToIso,
} from '../lib/time';
import type { Category, ColorMode, SidebarSection, Task, TaskPayload } from '../lib/types';

// ฟอร์มงานโหลดเมื่อเปิดใช้ครั้งแรกเท่านั้น (ไม่อยู่ใน chunk ที่ต้องใช้ตอนแสดงปฏิทินครั้งแรก)
const TaskDrawer = lazy(() => import('../components/TaskDrawer'));

// ค่าคงที่ของ FullCalendar อยู่นอกคอมโพเนนต์ เพื่อให้ identity คงที่ (ไม่ทำให้ปฏิทินเทียบ options/re-render ทุกครั้ง)
const PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin];
const LOCALES = [thLocale];
const BUTTON_TEXT = { list: t.nav.listView };
const VIEW_KEY = 'dobby.calView';
const loadViewMode = (): CalMode => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'cards' || v === 'grid' || v === 'month' || v === 'list') return v;
  } catch {
    /* ไม่มี storage ก็ใช้ค่าเริ่มต้น */
  }
  return 'cards';
};

function useMedia(query: string) {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setM(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return m;
}

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
      dot: c.dot,
      finished: task.status === 'done' || task.status === 'cancelled',
      urgency: task.urgency,
      importance: task.importance,
      dueAt: task.dueAt,
      dueDate: task.dueDate,
      status: task.status,
      category: (task.categoryId && cats.get(task.categoryId)?.name) || '',
      attachmentCount: task.attachmentCount,
      recurring: !!(task.recurrenceRule || task.recurrenceId),
      subtaskTotal: task.subtaskTotal,
      subtaskDone: task.subtaskDone,
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
    // เริ่ม = จบ (หรือไม่มีจบและไม่มีเวลาประมาณ) = จุดเวลา: แสดงธง + เวลาเดียว, บล็อกบนตารางสูงขั้นต่ำ 30 นาทีให้กดได้
    const point = isPointInTime(task);
    const end = point
      ? addMinutesWall(start, 30)
      : task.endAt && task.endAt !== task.startAt
        ? isoToWall(task.endAt)
        : addMinutesWall(start, task.estimateMinutes ?? 60);
    return {
      ...base,
      start,
      end,
      allDay: false,
      durationEditable: !point,
      extendedProps: { ...base.extendedProps, kind: 'timed', point },
    };
  }
  if (task.dueAt) {
    const end = isoToWall(task.dueAt);
    return {
      ...base,
      start: end,
      end: addMinutesWall(end, 30),
      allDay: false,
      durationEditable: false,
      extendedProps: { ...base.extendedProps, kind: 'deadline', point: true },
    };
  }
  return null;
}

/** ธงเดดไลน์บนปฏิทิน (ตารางเวลา/เดือน/รายการ): งานที่จัดเวลาทำไว้วันอื่น แต่เดดไลน์ตกวันนี้ — กดเปิดงาน ลากไม่ได้ */
function deadlineFlagEvent(task: Task): EventInput {
  const due = task.dueAt ?? `${task.dueDate}T23:59:00+07:00`;
  const wall = isoToWall(new Date(Date.parse(due)).toISOString());
  return {
    id: `${task.id}#due`,
    title: task.title,
    start: wall,
    end: addMinutesWall(wall, 30),
    allDay: false,
    editable: false,
    classNames: ['dobby-flag'],
    backgroundColor: '#fef2f2',
    borderColor: '#f87171',
    textColor: '#7f1d1d',
    extendedProps: {
      kind: 'flag',
      flag: true,
      point: true,
      urgency: task.urgency,
      importance: task.importance,
      stripe: '#dc2626',
      dueAt: task.dueAt,
      dueDate: task.dueDate,
      status: task.status,
      finished: false,
      category: '',
    },
  };
}

const onEventMount = (info: { el: HTMLElement; event: Parameters<typeof EVENT_TIP>[0] }) => {
  info.el.title = EVENT_TIP(info.event);
};

const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];

/** หัวคอลัมน์วัน 2 แถว: ชื่อวัน / วันที่ (วันนี้เน้นเป็นวงกลม) — ใช้กับมุมมองวัน/สัปดาห์ ส่วนเดือนใช้ชื่อวันเดิม */
function renderDayHeader(arg: DayHeaderContentArg) {
  if (arg.view.type === 'dayGridMonth') return arg.text;
  const d = arg.date;
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
        {DAY_NAMES[d.getUTCDay()]}
      </span>
      <span
        className={`mt-0.5 inline-flex min-w-[2.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-sm font-semibold tabular-nums ${arg.isToday ? 'bg-brand-600 text-white' : ''}`}
      >
        {d.getUTCDate()}/{d.getUTCMonth() + 1}
      </span>
    </div>
  );
}

const hm = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : '');

/** ข้อความเวลาบนก้อนงาน: จุดเวลา = ⚑ + เวลาเดียว, ช่วงเวลา = "09:00–17:00" (ไม่ใช้ "9:00 - 17:00" ของ FullCalendar) */
function eventTimeText(arg: EventContentArg): string {
  if (!arg.timeText) return ''; // มุมมองรายการ/ทั้งวันมีช่องเวลาของตัวเอง
  const { event } = arg;
  if (event.extendedProps.point) return hm(event.start);
  const timeGrid = arg.view.type.startsWith('timeGrid');
  return timeGrid && event.end ? `${hm(event.start)}–${hm(event.end)}` : hm(event.start);
}

const EVENT_TIP = (e: {
  title: string;
  extendedProps: Record<string, unknown>;
  start: Date | null;
  end: Date | null;
}) => {
  const x = e.extendedProps;
  const time =
    x.kind === 'allday' ? 'ทั้งวัน' : x.point ? hm(e.start) : `${hm(e.start)}–${hm(e.end)}`;
  return [`${time} ${e.title}`, x.category as string, x.finished ? t.status.done : '']
    .filter(Boolean)
    .join(' · ');
};

function renderEvent(arg: EventContentArg) {
  const x = arg.event.extendedProps as {
    stripe: string;
    urgency: number;
    importance: number;
    point?: boolean;
    finished?: boolean;
    dueAt: string | null;
    dueDate: string | null;
    status: Task['status'];
  };
  const time = eventTimeText(arg);
  return (
    <div
      className="flex h-full min-w-0 flex-col gap-0.5 overflow-hidden"
      style={{ borderLeft: `4px solid ${x.stripe}`, paddingLeft: 4 }}
    >
      <div className="dobby-line min-w-0 truncate text-xs leading-tight">
        <UrgencyText level={x.urgency} />
        {time && (
          <span className="dobby-time mr-1 font-semibold tabular-nums">
            {x.point && (
              <span aria-label={t.chips.deadline} className="mr-0.5">
                ⚑
              </span>
            )}
            {time}
          </span>
        )}
        {x.finished && (
          <span aria-hidden className="mr-0.5 font-bold">
            ✓
          </span>
        )}
        <span className="dobby-title">{arg.event.title}</span>
        {arg.event.extendedProps.recurring && (
          <span role="img" aria-label={t.series.badge} className="ml-1">
            🔁
          </span>
        )}
      </div>
      {/* ชิปอยู่บรรทัดที่สอง: ซ่อนเมื่อก้อนเตี้ย (.fc-timegrid-event-short) เพื่อให้ชื่อ+เวลาอยู่บรรทัดเดียว */}
      <div className="dobby-chips flex flex-wrap items-center gap-1">
        <ImportanceChip level={x.importance} />
        <CountdownChip task={{ dueAt: x.dueAt, dueDate: x.dueDate, status: x.status }} />
        {(arg.event.extendedProps.subtaskTotal as number) > 0 && (
          <span className="text-[11px]">
            ☑{arg.event.extendedProps.subtaskDone as number}/
            {arg.event.extendedProps.subtaskTotal as number}
          </span>
        )}
        {(arg.event.extendedProps.attachmentCount as number) > 0 && (
          <span role="img" aria-label={t.attach.title} className="text-[11px]">
            📎
          </span>
        )}
      </div>
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

export default function CalendarPage() {
  const { user, categories, reloadCategories, gcalAvailable } = useApp();
  const calRef = useRef<FullCalendar>(null);
  const isMobile = useIsMobile();
  const [viewDate, setViewDate] = useState(todayYmd);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [work, setWork] = useState<WorkHours>(DEFAULT_WORK);
  const [viewMode, setViewModeState] = useState<CalMode>(loadViewMode);
  const [calTitle, setCalTitle] = useState('');
  const [trayKey, setTrayKey] = useState(0);
  const [trayCount, setTrayCount] = useState(0);
  const [trayOpen, setTrayOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const trayMap = useRef(new Map<string, Task>());
  const initialDate = useRef(viewDate);
  const isNarrow = useMedia('(max-width: 1023px)');
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

  // ส่วนของแถบข้างที่แสดง: เก็บต่อบัญชีบนเซิร์ฟเวอร์ (แคชใน localStorage แยกตามผู้ใช้กันกระพริบ)
  const sbKey = `dobby.sidebar.${user.id}`;
  const [sections, setSections] = useState<SidebarSection[]>(() => {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(sbKey) ?? 'null');
      if (Array.isArray(v)) return sortSections(v as SidebarSection[]);
    } catch {
      /* ใช้ค่าเริ่มต้น */
    }
    return SIDEBAR_DEFAULT;
  });
  useEffect(() => {
    let alive = true;
    api
      .getSettings()
      .then((r) => {
        if (!alive) return;
        setSections(sortSections(r.sidebarSections));
        setWork({ start: r.work.start, end: r.work.end, days: r.work.days });
        try {
          localStorage.setItem(sbKey, JSON.stringify(r.sidebarSections));
        } catch {
          /* ignore */
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [sbKey]);
  const saveSections = (next: SidebarSection[]) => {
    setSections(next);
    // ส่วนที่ซ่อนจะไม่กรองอีก (กันกรองทิ้งงานโดยผู้ใช้มองไม่เห็นว่าทำไม)
    setFilters((f) => ({
      ...f,
      q: next.includes('search') ? f.q : '',
      tag: next.includes('tag') ? f.tag : '',
      categories: next.includes('category') ? f.categories : new Set(),
      urgency: next.includes('urgency') ? f.urgency : new Set(),
      importance: next.includes('importance') ? f.importance : new Set(),
      statuses: next.includes('status') ? f.statuses : emptyFilters().statuses,
    }));
    try {
      localStorage.setItem(sbKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    api.patchSettings({ sidebarSections: next }).catch(() => setError(t.error.loadFailed));
  };

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const allTags = useMemo(() => [...new Set(tasks.flatMap((x) => x.tags))].sort(), [tasks]);
  const filtered = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);
  const events = useMemo(
    () =>
      filtered.flatMap((x) => {
        const main = taskToEvent(x, mode, catMap);
        const flag =
          x.startAt && (x.dueAt || x.dueDate) && x.status !== 'done' && x.status !== 'cancelled'
            ? deadlineFlagEvent(x)
            : null;
        return [main, flag].filter((e): e is EventInput => e !== null);
      }),
    [filtered, mode, catMap],
  );

  const loadTasks = useCallback(async () => {
    if (!range) return;
    try {
      setTasks(await api.listTasks(range.from, range.to));
    } catch {
      setError(t.error.loadFailed);
    }
  }, [range]);
  useEffect(() => void loadTasks(), [loadTasks]);

  // ลิงก์ "แก้ไข" จาก LINE: /?task=<id> เปิดฟอร์มงานนั้นทันที
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('task');
    if (!id) return;
    window.history.replaceState(null, '', window.location.pathname);
    api
      .getTask(id)
      .then((task) => setDrawer({ task }))
      .catch(() => setError(t.error.loadFailed));
  }, []);

  const refreshAll = useCallback(() => {
    void loadTasks();
    setTrayKey((k) => k + 1);
  }, [loadTasks]);

  /** บันทึกการจัดงานแบบ optimistic: อัปเดตจอ (รวมแถบภาระงาน) ทันที แล้วค่อยบันทึก ถ้าล้มเหลวย้อนกลับและแจ้งผู้ใช้ */
  const commit = useCallback(
    async (task: Task, patch: TaskPayload) => {
      const snapshot = tasks;
      setNotice('');
      setTasks((prev) => {
        const next = { ...task, ...patch } as Task;
        return prev.some((x) => x.id === task.id)
          ? prev.map((x) => (x.id === task.id ? next : x))
          : [...prev, next];
      });
      try {
        await api.updateTask(task.id, patch);
        refreshAll();
      } catch (e) {
        setTasks(snapshot);
        setError(e instanceof ApiClientError ? e.message : t.cal.moveFailed);
      }
    },
    [tasks, refreshAll],
  );

  const nowMinute = () => {
    const w = wallNow();
    return w.getUTCHours() * 60 + w.getUTCMinutes();
  };

  /** วางงานลงวัน (มุมมองการ์ด / เมนู "จัดลง…" ในถาด) */
  const dropOnDay = (id: string, day: string, source: DropSource) => {
    const task = source === 'tray' ? trayMap.current.get(id) : tasks.find((x) => x.id === id);
    if (!task) return;
    const dayTasks = tasks.filter((x) => x.id !== task.id && scheduledOn(x, day));
    const r = planDrop(task, day, {
      source,
      work,
      dayTasks,
      nowMin: day === todayYmd() ? nowMinute() : undefined,
    });
    if (!r) return;
    if (!r.fits) setNotice(t.cal.dayFull);
    void commit(task, r.patch);
  };

  // time blocking บนตารางเวลา: ลากงานจากถาดมาวางที่ช่องเวลา (ความยาว = estimate, คงเดดไลน์เดิม) / ช่องทั้งวัน = งานทั้งวัน
  const onExternalDrop = (info: DropArg) => {
    const task = trayMap.current.get(info.draggedEl.dataset.inboxId ?? '');
    if (!task) return;
    const patch: TaskPayload = info.allDay
      ? { allDay: true, dueDate: calDateToYmd(info.date), startAt: null, endAt: null, dueAt: null }
      : planDropAt(task, calDateToIso(info.date));
    void commit(task, patch);
  };

  const completeTask = (task: Task) => {
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, status: 'done' } : x)));
    api
      .completeTask(task.id)
      .then(refreshAll)
      .catch((e) => {
        setError(e instanceof ApiClientError ? e.message : t.error.generic);
        void loadTasks();
      });
  };

  const setViewMode = (m: CalMode) => {
    initialDate.current = viewDate;
    setViewModeState(m);
    try {
      localStorage.setItem(VIEW_KEY, m);
    } catch {
      /* ignore */
    }
  };
  const gotoDate = (d: string) => {
    if (viewMode === 'cards') setViewDate(d);
    else calRef.current?.getApi().gotoDate(d);
  };
  const step = (dir: -1 | 0 | 1) => {
    if (viewMode === 'cards') setViewDate(dir === 0 ? todayYmd() : addDaysYmd(viewDate, dir * 7));
    else {
      const api = calRef.current?.getApi();
      if (dir === 0) api?.today();
      else if (dir < 0) api?.prev();
      else api?.next();
    }
  };

  // มุมมองการ์ด: ช่วงข้อมูล = สัปดาห์ (จันทร์–อาทิตย์) ที่ viewDate อยู่ ; มุมมอง FullCalendar: ช่วงมาจาก datesSet
  useEffect(() => {
    if (viewMode !== 'cards') return;
    const mon = mondayOf(viewDate);
    const from = wallToIso(`${mon}T00:00`);
    const to = wallToIso(`${addDaysYmd(mon, 7)}T00:00`);
    setRange((prev) => (prev && prev.from === from && prev.to === to ? prev : { from, to }));
  }, [viewMode, viewDate]);

  const weekTitle = useMemo(() => {
    const mon = mondayOf(viewDate);
    const f = (ymd: string, year: boolean) =>
      new Date(`${ymd}T00:00:00Z`).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        ...(year ? { year: 'numeric' as const } : {}),
        timeZone: 'UTC',
      });
    return `${f(mon, false)} – ${f(addDaysYmd(mon, 6), true)}`;
  }, [viewDate]);

  // FullCalendar อาจเรียก datesSet ซ้ำเมื่อ re-render: ตั้งค่าใหม่เฉพาะเมื่อช่วงเปลี่ยนจริง
  const onDatesSet = useCallback((a: DatesSetArg) => {
    const from = calDateToIso(a.start);
    const to = calDateToIso(a.end);
    setRange((prev) => (prev && prev.from === from && prev.to === to ? prev : { from, to }));
    setViewDate(calDateToYmd(a.view.calendar.getDate()));
    setCalTitle(a.view.title);
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
    const task = tasks.find((x) => x.id === info.event.id.replace(/#due$/, ''));
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
          ? { allDay: false, dueAt: calDateToIso(start) }
          : ev.extendedProps.point
            ? { allDay: false, startAt: calDateToIso(start), endAt: calDateToIso(start) }
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

  // handler ที่ identity คงที่ (อ้างค่าล่าสุดผ่าน ref) เพื่อไม่ให้ FullCalendar re-render ทุกครั้งที่ state อื่นเปลี่ยน
  const latest = useRef({ onExternalDrop, onSelect, onEventClick, persistMove });
  latest.current = { onExternalDrop, onSelect, onEventClick, persistMove };
  const h = useMemo(
    () => ({
      drop: (i: DropArg) => latest.current.onExternalDrop(i),
      select: (i: DateSelectArg) => latest.current.onSelect(i),
      eventClick: (i: EventClickArg) => latest.current.onEventClick(i),
      move: (i: EventDropArg | EventResizeDoneArg) => latest.current.persistMove(i),
    }),
    [],
  );
  const calendar = useMemo(
    () => (
      <FullCalendar
        ref={calRef}
        plugins={PLUGINS}
        locales={LOCALES}
        locale="th"
        timeZone="UTC"
        now={wallNow}
        nowIndicator
        firstDay={1}
        key={viewMode}
        initialView={
          viewMode === 'month'
            ? 'dayGridMonth'
            : viewMode === 'list'
              ? 'listWeek'
              : isMobile
                ? 'timeGridDay'
                : 'timeGridWeek'
        }
        initialDate={initialDate.current}
        headerToolbar={false}
        footerToolbar={false}
        height={isMobile ? 'auto' : 'calc(100vh - 13rem)'}
        scrollTime="07:00:00"
        slotEventOverlap
        editable
        droppable
        drop={h.drop}
        selectable
        selectMirror
        dayMaxEvents
        events={events}
        dayHeaderContent={renderDayHeader}
        eventContent={renderEvent}
        eventShortHeight={40}
        eventDidMount={onEventMount}
        select={h.select}
        eventClick={h.eventClick}
        eventDrop={h.move}
        eventResize={h.move}
        datesSet={onDatesSet}
      />
    ),
    [isMobile, events, h, onDatesSet, viewMode],
  );

  const sideCols = showFilters
    ? 'lg:grid-cols-[14rem_minmax(0,1fr)_16rem]'
    : 'lg:grid-cols-[minmax(0,1fr)_16rem]';
  const dragMode = viewMode === 'cards' ? 'cards' : viewMode === 'list' ? 'none' : 'fc';

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 py-2 dark:border-slate-700">
        <Popover label={t.view.title} icon="🎨">
          <fieldset className="space-y-1">
            <legend className="mb-1 text-xs font-semibold">{t.colorBy.label}</legend>
            {(['category', 'urgency', 'importance'] as ColorMode[]).map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-2 py-0.5">
                <input
                  type="radio"
                  name="color-mode"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="h-4 w-4 accent-brand-600"
                />
                {t.colorBy[m]}
              </label>
            ))}
          </fieldset>
        </Popover>
        <button
          type="button"
          className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
        >
          {showFilters ? t.nav.hideFilters : t.nav.filters}
          {activeCount(filters) > 0 && ` (${activeCount(filters)})`}
        </button>
        <button
          type="button"
          onClick={() => setDrawer({ prefill: { allDay: false } })}
          className="ml-auto rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          + {t.nav.newTask}
        </button>
      </div>

      <div className="pt-3">
        <CalToolbar
          title={viewMode === 'cards' ? weekTitle : calTitle}
          mode={viewMode}
          onMode={setViewMode}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onToday={() => step(0)}
          trayCount={trayCount}
          onTray={() => setTrayOpen(true)}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 flex items-center justify-between rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
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
      {notice && (
        <p
          role="status"
          className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          {notice}
        </p>
      )}

      <div className={`grid flex-1 gap-4 py-3 ${sideCols}`}>
        {showFilters && (
          <aside className="space-y-4">
            <SidebarCustomize value={sections} onChange={saveSections} />
            {sections.includes('mini') && <MiniCalendar selected={viewDate} onPick={gotoDate} />}
            <Filters
              value={filters}
              onChange={setFilters}
              categories={categories}
              allTags={allTags}
              sections={sections}
            />
            {sections.includes('legend') && (
              <Legend categories={categories} onChanged={reloadCategories} mode={mode} />
            )}
          </aside>
        )}

        <main className="min-w-0">
          {viewMode === 'cards' ? (
            <WeekCards
              weekStart={mondayOf(viewDate)}
              tasks={filtered}
              work={work}
              today={todayYmd()}
              mode={mode}
              catMap={catMap}
              isMobile={isNarrow}
              selectedDay={viewDate}
              onSelectDay={setViewDate}
              onOpen={(x) => setDrawer({ task: x })}
              onAdd={(day) => setDrawer({ prefill: { allDay: true, date: day } })}
              onComplete={completeTask}
              onDropTask={dropOnDay}
            />
          ) : (
            calendar
          )}
        </main>

        {!isNarrow && (
          <TaskTray
            reloadKey={trayKey}
            dragMode={dragMode}
            variant="side"
            onOpen={(x) => setDrawer({ task: x })}
            onSchedule={(x, ymd) => dropOnDay(x.id, ymd, 'tray')}
            onLoaded={(list) => {
              trayMap.current = new Map(list.map((x) => [x.id, x]));
              setTrayCount(list.length);
            }}
          />
        )}
      </div>

      {isNarrow && (
        <TaskTray
          reloadKey={trayKey}
          dragMode="none"
          variant="sheet"
          open={trayOpen}
          onClose={() => setTrayOpen(false)}
          onOpen={(x) => {
            setTrayOpen(false);
            setDrawer({ task: x });
          }}
          onSchedule={(x, ymd) => {
            dropOnDay(x.id, ymd, 'tray');
            setTrayOpen(false);
          }}
          onLoaded={(list) => {
            trayMap.current = new Map(list.map((x) => [x.id, x]));
            setTrayCount(list.length);
          }}
        />
      )}

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
              refreshAll();
            }}
            onAttachmentsChanged={refreshAll}
            onOpenTask={(task) => setDrawer({ task })}
          />
        </Suspense>
      )}
    </div>
  );
}

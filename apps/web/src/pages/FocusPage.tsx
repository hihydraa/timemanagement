import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { formatMinutes } from '../lib/dates';
import { t } from '../lib/i18n';
import { isoToWall } from '../lib/time';
import type { FocusSession, Task } from '../lib/types';

interface Run {
  phase: 'focus' | 'break';
  startedAt: number;
  endsAt: number;
  taskId: string | null;
  focusMin: number;
  breakMin: number;
}
interface Pending {
  taskId: string | null;
  startedAt: string;
  endedAt: string;
  minutes: number;
}

const RUN_KEY = 'dobby.focus.run';
const SET_KEY = 'dobby.focus.settings';
const MAX_AGE_MS = 3 * 86_400_000 - 60_000; // เซิร์ฟเวอร์รับเซสชันที่จบไม่เกิน 3 วัน

const store = {
  get<T>(k: string): T | null {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* ไม่มี storage: ตัวจับเวลายังทำงานได้ในหน้านี้ แต่ไม่รอดการรีเฟรช */
    }
  },
};
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.value = 0.15;
    o.frequency.value = 880;
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch {
    /* ไม่มีเสียงก็ไม่เป็นไร */
  }
}
function notify(body: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted')
      new Notification('Dobby', { body });
  } catch {
    /* ignore */
  }
}

export default function FocusPage() {
  const saved = store.get<{ focusMin: number; breakMin: number }>(SET_KEY);
  const [focusMin, setFocusMin] = useState(saved?.focusMin ?? 25);
  const [breakMin, setBreakMin] = useState(saved?.breakMin ?? 5);
  const [taskId, setTaskId] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [run, setRun] = useState<Run | null>(() => store.get<Run>(RUN_KEY));
  const [now, setNow] = useState(Date.now());
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [total, setTotal] = useState(0);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [perm, setPerm] = useState<string>(() =>
    'Notification' in window ? Notification.permission : 'denied',
  );
  const busyRef = useRef(false);

  const loadSessions = useCallback(() => {
    api
      .focusSessions()
      .then((r) => {
        setSessions(r.sessions);
        setTotal(r.totalMinutes);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    api
      .matrix()
      .then(setTasks)
      .catch(() => undefined);
    loadSessions();
  }, [loadSessions]);

  useEffect(() => store.set(SET_KEY, { focusMin, breakMin }), [focusMin, breakMin]);
  useEffect(() => store.set(RUN_KEY, run), [run]);

  const record = useCallback(
    async (p: Pending) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setError('');
      try {
        await api.createFocusSession(p);
        setPending(null);
        loadSessions();
      } catch (e) {
        setPending(p);
        setError(
          e instanceof ApiClientError ? `${t.focus.saveFailed}: ${e.message}` : t.focus.saveFailed,
        );
      } finally {
        busyRef.current = false;
      }
    },
    [loadSessions],
  );

  const finishFocus = useCallback(
    async (r: Run, endedMs: number, auto: boolean) => {
      const minutes = auto ? r.focusMin : Math.floor((endedMs - r.startedAt) / 60_000);
      setRun(null);
      if (minutes < 1) {
        setMsg(t.focus.tooShort);
        return;
      }
      if (Date.now() - endedMs > MAX_AGE_MS) return; // เก่าเกินกว่าเซิร์ฟเวอร์จะรับ
      await record({
        taskId: r.taskId,
        startedAt: new Date(r.startedAt).toISOString(),
        endedAt: new Date(endedMs).toISOString(),
        minutes,
      });
      if (auto) {
        beep();
        notify(`${t.focus.done} ${minutes} ${t.focus.minutes}`);
        if (r.breakMin > 0) {
          const start = Date.now();
          setRun({
            phase: 'break',
            startedAt: start,
            endsAt: start + r.breakMin * 60_000,
            taskId: r.taskId,
            focusMin: r.focusMin,
            breakMin: r.breakMin,
          });
          setMsg(`${t.focus.done} ${minutes} ${t.focus.minutes} — ${t.focus.phaseBreak}`);
        } else {
          setMsg(`${t.focus.done} ${minutes} ${t.focus.minutes}`);
        }
      } else {
        setMsg(`${t.focus.done} ${minutes} ${t.focus.minutes}`);
      }
    },
    [record],
  );

  // กู้สถานะเมื่อเปิดหน้า: ถ้าเวลาหมดไปแล้วระหว่างปิดหน้า บันทึกเซสชันตามเวลาจบจริง
  useEffect(() => {
    const r = store.get<Run>(RUN_KEY);
    if (!r || Date.now() < r.endsAt) return;
    if (r.phase === 'focus') {
      void finishFocus(r, r.endsAt, true).then(() => {
        setRun(null);
        setMsg(t.focus.recovered);
      });
    } else {
      setRun(null);
      setMsg(t.focus.breakOver);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // จับเวลาจาก timestamp (ไม่นับทีละวินาที) จึงไม่เพี้ยนเมื่อแท็บถูกหน่วง
  useEffect(() => {
    if (!run) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= run.endsAt) {
        clearInterval(id);
        if (run.phase === 'focus') void finishFocus(run, run.endsAt, true);
        else {
          setRun(null);
          beep();
          notify(t.focus.breakOver);
          setMsg(t.focus.breakOver);
        }
      }
    }, 250);
    return () => clearInterval(id);
  }, [run, finishFocus]);

  useEffect(() => {
    const old = document.title;
    if (run)
      document.title = `${run.phase === 'focus' ? '⏱' : '☕'} ${mmss(run.endsAt - now)} · ${t.appName}`;
    return () => {
      document.title = old;
    };
  }, [run, now]);

  const start = () => {
    const f = clamp(focusMin, 1, 120);
    const b = clamp(breakMin, 0, 60);
    setFocusMin(f);
    setBreakMin(b);
    setMsg('');
    setError('');
    const s = Date.now();
    setNow(s);
    setRun({
      phase: 'focus',
      startedAt: s,
      endsAt: s + f * 60_000,
      taskId: taskId || null,
      focusMin: f,
      breakMin: b,
    });
  };

  const remaining = run ? run.endsAt - now : 0;
  const total_ = run ? run.endsAt - run.startedAt : 1;
  const progress = run ? Math.min(1, Math.max(0, 1 - remaining / total_)) : 0;
  const R = 90;
  const C = 2 * Math.PI * R;
  const field =
    'w-24 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800';
  const phaseLabel = run
    ? run.phase === 'focus'
      ? t.focus.phaseFocus
      : t.focus.phaseBreak
    : t.focus.phaseIdle;

  return (
    <main className="mx-auto grid max-w-3xl gap-4 p-3 md:grid-cols-[1fr_16rem]">
      <section aria-label={t.focus.title} className="space-y-4">
        <h2 className="text-lg font-semibold">{t.focus.title}</h2>

        <div className="flex flex-col items-center gap-3">
          <div className="relative h-56 w-56">
            <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" aria-hidden>
              <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                strokeWidth="10"
                className="stroke-slate-200 dark:stroke-slate-700"
              />
              <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - progress)}
                className={run?.phase === 'break' ? 'stroke-green-500' : 'stroke-indigo-600'}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div
                role="timer"
                aria-live="off"
                data-testid="focus-timer"
                className="font-mono text-5xl font-bold tabular-nums"
              >
                {run ? mmss(remaining) : mmss(clamp(focusMin, 1, 120) * 60_000)}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300">{phaseLabel}</div>
            </div>
          </div>

          {!run && (
            <button
              type="button"
              onClick={start}
              className="rounded-full bg-indigo-600 px-8 py-3 text-base font-semibold text-white hover:bg-indigo-700"
            >
              {t.focus.start}
            </button>
          )}
          {run?.phase === 'focus' && (
            <button
              type="button"
              onClick={() => void finishFocus(run, Date.now(), false)}
              className="rounded-full border border-slate-300 px-6 py-2 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              {t.focus.stop}
            </button>
          )}
          {run?.phase === 'break' && (
            <button
              type="button"
              onClick={() => setRun(null)}
              className="rounded-full border border-slate-300 px-6 py-2 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              {t.focus.skipBreak}
            </button>
          )}
        </div>

        <p
          role="status"
          aria-live="polite"
          className="min-h-5 text-center text-sm text-green-700 dark:text-green-400"
        >
          {msg}
        </p>
        {error && (
          <p
            role="alert"
            className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {error}{' '}
            {pending && (
              <button
                type="button"
                onClick={() => void record(pending)}
                className="font-medium underline"
              >
                {t.focus.retry}
              </button>
            )}
          </p>
        )}

        <fieldset disabled={!!run} className="grid grid-cols-2 gap-3 disabled:opacity-60">
          <div className="col-span-2">
            <label
              htmlFor="focus-task"
              className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              {t.focus.task}
            </label>
            <select
              id="focus-task"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">{t.focus.noTask}</option>
              {tasks.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="focus-min"
              className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              {t.focus.focusMin}
            </label>
            <input
              id="focus-min"
              type="number"
              min={1}
              max={120}
              value={focusMin}
              onChange={(e) => setFocusMin(Number(e.target.value))}
              className={field}
            />
          </div>
          <div>
            <label
              htmlFor="break-min"
              className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              {t.focus.breakMin}
            </label>
            <input
              id="break-min"
              type="number"
              min={0}
              max={60}
              value={breakMin}
              onChange={(e) => setBreakMin(Number(e.target.value))}
              className={field}
            />
          </div>
        </fieldset>

        {perm === 'default' && (
          <button
            type="button"
            onClick={() => void Notification.requestPermission().then(setPerm)}
            className="text-xs text-indigo-600 underline dark:text-indigo-400"
          >
            {t.focus.notify}
          </button>
        )}
      </section>

      <aside aria-label={t.focus.sessions} className="space-y-2">
        <h3 className="font-semibold">{t.focus.sessions}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t.focus.todayTotal}: <strong data-testid="focus-total">{formatMinutes(total)}</strong>
        </p>
        {sessions.length === 0 && <p className="text-sm text-slate-500">{t.focus.none}</p>}
        <ul className="space-y-1">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="rounded border border-slate-200 p-2 text-sm dark:border-slate-700"
            >
              <span className="font-mono text-xs text-slate-500">
                {isoToWall(s.startedAt).slice(11, 16)}
              </span>{' '}
              · {s.minutes} {t.focus.minutes}
              <div className="truncate text-xs text-slate-600 dark:text-slate-300">
                {s.title ?? t.focus.noTask}
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}

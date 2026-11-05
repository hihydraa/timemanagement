import { useCallback, useEffect, useState } from 'react';
import TaskDrawer from '../components/TaskDrawer';
import TaskMeta from '../components/TaskMeta';
import { api, ApiClientError } from '../lib/api';
import { useApp } from '../lib/appContext';
import { dayLabel, todayYmd } from '../lib/dates';
import { movedPatch } from '../lib/matrix';
import { URGENCY_COLORS } from '../lib/colors';
import { t } from '../lib/i18n';
import type { Task } from '../lib/types';

/** ด่วน = urgency ≥ 3, สำคัญ = importance ≥ 3 */
const isUrgent = (x: Task) => x.urgency >= 3;
const isImportant = (x: Task) => x.importance >= 3;

interface Quad {
  id: string;
  urgent: boolean;
  important: boolean;
  title: string;
  sub: string;
  tone: string;
}
const QUADS: Quad[] = [
  {
    id: 'q1',
    urgent: true,
    important: true,
    title: t.matrix.q1,
    sub: `${t.matrix.urgent} · ${t.matrix.important}`,
    tone: 'border-red-300 dark:border-red-800',
  },
  {
    id: 'q2',
    urgent: false,
    important: true,
    title: t.matrix.q2,
    sub: `${t.matrix.notUrgent} · ${t.matrix.important}`,
    tone: 'border-blue-300 dark:border-blue-800',
  },
  {
    id: 'q3',
    urgent: true,
    important: false,
    title: t.matrix.q3,
    sub: `${t.matrix.urgent} · ${t.matrix.notImportant}`,
    tone: 'border-amber-300 dark:border-amber-800',
  },
  {
    id: 'q4',
    urgent: false,
    important: false,
    title: t.matrix.q4,
    sub: `${t.matrix.notUrgent} · ${t.matrix.notImportant}`,
    tone: 'border-slate-300 dark:border-slate-600',
  },
];
const quadOf = (x: Task) =>
  QUADS.find((q) => q.urgent === isUrgent(x) && q.important === isImportant(x))!;

export default function MatrixPage() {
  const { categories, gcalAvailable } = useApp();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [drawer, setDrawer] = useState<Task | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [over, setOver] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .matrix()
      .then(setTasks)
      .catch(() => setError(t.error.loadFailed));
  }, []);
  useEffect(load, [load]);

  async function move(task: Task, quad: Quad) {
    if (quadOf(task).id === quad.id) return;
    const next = movedPatch(task, quad, todayYmd());
    const prev = tasks;
    setError('');
    try {
      await api.updateTask(task.id, next);
      load(); // ความเร่งด่วนคำนวณที่เซิร์ฟเวอร์ → โหลดใหม่เพื่อให้การ์ดอยู่ช่องที่ถูกต้อง
      setNotice(`${t.matrix.moved}: ${task.title} → ${quad.title}`);
    } catch (e) {
      setTasks(prev);
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    }
  }

  return (
    <div className="space-y-3 py-3">
      <h2 className="text-lg font-semibold">{t.matrix.title}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t.matrix.hint}</p>
      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}
      <p
        role="status"
        aria-live="polite"
        className="min-h-5 text-sm text-green-700 dark:text-green-400"
      >
        {notice}
      </p>
      {!tasks && !error && <p role="status">{t.loading}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {QUADS.map((q) => {
          const items = tasks?.filter((x) => quadOf(x).id === q.id) ?? [];
          return (
            <section
              key={q.id}
              aria-label={`${q.title} (${q.sub})`}
              data-quad={q.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(q.id);
              }}
              onDragLeave={() => setOver((o) => (o === q.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData('text/plain');
                const task = tasks?.find((x) => x.id === id);
                if (task) void move(task, q);
              }}
              className={`min-h-40 rounded-lg border-2 p-3 ${q.tone} ${over === q.id ? 'bg-brand-50 dark:bg-brand-950' : ''}`}
            >
              <h3 className="font-semibold">
                {q.title}{' '}
                <span className="text-xs font-normal text-slate-500">
                  ({q.sub}) · {items.length}
                </span>
              </h3>
              <ul className="mt-2 space-y-2">
                {items.length === 0 && <li className="text-sm text-slate-500">{t.matrix.empty}</li>}
                {items.map((task) => (
                  <li
                    key={task.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', task.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    className="cursor-grab rounded-lg border border-l-4 border-slate-200 bg-white p-2 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-800"
                    style={{ borderLeftColor: URGENCY_COLORS[task.urgency] }}
                  >
                    <button
                      type="button"
                      onClick={() => setDrawer(task)}
                      className="block w-full text-left"
                    >
                      <span className="block break-words text-sm font-medium">{task.title}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {task.startAt || task.dueAt || task.dueDate
                          ? dayLabel((task.startAt ?? task.dueAt ?? task.dueDate!).slice(0, 10))
                          : ''}{' '}
                      </span>
                      <TaskMeta task={task} />
                    </button>
                    {/* ทางเลือกสำหรับมือถือ/คีย์บอร์ด (HTML5 drag ไม่ทำงานบนหน้าจอสัมผัส) */}
                    <label className="mt-1 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                      {t.matrix.moveTo}
                      <select
                        value=""
                        aria-label={`${t.matrix.moveTo}: ${task.title}`}
                        onChange={(e) => {
                          const dest = QUADS.find((x) => x.id === e.target.value);
                          if (dest) void move(task, dest);
                        }}
                        className="rounded border border-slate-300 bg-white px-1 py-0.5 dark:border-slate-600 dark:bg-slate-800"
                      >
                        <option value="">—</option>
                        {QUADS.filter((x) => x.id !== q.id).map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {drawer && (
        <TaskDrawer
          key={drawer.id}
          init={{ task: drawer }}
          categories={categories}
          gcalAvailable={gcalAvailable}
          onOpenTask={setDrawer}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            load();
          }}
          onAttachmentsChanged={load}
        />
      )}
    </div>
  );
}

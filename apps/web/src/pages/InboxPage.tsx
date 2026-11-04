import { useCallback, useEffect, useState } from 'react';
import TaskDrawer from '../components/TaskDrawer';
import TaskMeta from '../components/TaskMeta';
import { api, ApiClientError } from '../lib/api';
import { useApp } from '../lib/appContext';
import { nextMonday, todayYmd, tomorrow } from '../lib/dates';
import { t } from '../lib/i18n';
import type { Task } from '../lib/types';

export default function InboxPage() {
  const { categories, gcalAvailable } = useApp();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [drawer, setDrawer] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .inbox()
      .then(setTasks)
      .catch(() => setError(t.error.loadFailed));
  }, []);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError('');
    setBusy(true);
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  }

  const schedule = (task: Task, dueDate: string) =>
    run(() => api.updateTask(task.id, { allDay: true, dueDate }));

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const v = title.trim();
    if (!v) return;
    await run(() => api.createTask({ title: v }));
    setTitle('');
  }

  const btn =
    'rounded border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800';

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-3">
      <h2 className="text-lg font-semibold">{t.inbox.title}</h2>

      <form onSubmit={quickAdd} className="flex gap-2">
        <label htmlFor="inbox-add" className="sr-only">
          {t.inbox.quickAdd}
        </label>
        <input
          id="inbox-add"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.inbox.quickAdd}
          className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
        />
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          +<span className="sr-only">{t.nav.newTask}</span>
        </button>
      </form>

      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {!tasks && !error && <p role="status">{t.loading}</p>}
      {tasks && tasks.length === 0 && <p className="text-slate-500">{t.inbox.empty}</p>}

      <ul className="space-y-2">
        {tasks?.map((task) => (
          <li
            key={task.id}
            className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                aria-label={`${t.today.complete}: ${task.title}`}
                onChange={() => void run(() => api.completeTask(task.id))}
              />
              <button
                type="button"
                onClick={() => setDrawer(task)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block break-words font-medium">{task.title}</span>
                <TaskMeta task={task} />
              </button>
            </div>
            <div
              className="mt-2 flex flex-wrap gap-1.5 pl-6"
              role="group"
              aria-label={`${t.inbox.scheduleTo}: ${task.title}`}
            >
              <button
                type="button"
                disabled={busy}
                className={btn}
                onClick={() => void schedule(task, todayYmd())}
              >
                {t.inbox.today}
              </button>
              <button
                type="button"
                disabled={busy}
                className={btn}
                onClick={() => void schedule(task, tomorrow())}
              >
                {t.inbox.tomorrow}
              </button>
              <button
                type="button"
                disabled={busy}
                className={btn}
                onClick={() => void schedule(task, nextMonday())}
              >
                {t.inbox.nextWeek}
              </button>
              <button type="button" disabled={busy} className={btn} onClick={() => setDrawer(task)}>
                {t.inbox.schedule}
              </button>
            </div>
          </li>
        ))}
      </ul>

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
    </main>
  );
}

import { useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { t } from '../lib/i18n';
import { inputToIso, isoToInput } from '../lib/time';
import type { Category, Status, Task, TaskPayload } from '../lib/types';

export interface DrawerInit {
  task?: Task;
  /** ค่าเริ่มต้นเมื่อสร้างใหม่ (จากการเลือกช่วงบนปฏิทิน) */
  prefill?: { allDay: boolean; startInput?: string; endInput?: string; date?: string };
}

interface Props {
  init: DrawerInit;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

const LEVELS = [1, 2, 3, 4];
const STATUSES: Status[] = ['todo', 'doing', 'done', 'cancelled'];
const inputCls =
  'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500';
const labelCls = 'block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1';

export default function TaskDrawer({ init, categories, onClose, onSaved }: Props) {
  const { task, prefill } = init;
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [categoryId, setCategoryId] = useState(task?.categoryId ?? '');
  const [urgency, setUrgency] = useState(task?.urgency ?? 2);
  const [importance, setImportance] = useState(task?.importance ?? 2);
  const [status, setStatus] = useState<Status>(task?.status ?? 'todo');
  const [allDay, setAllDay] = useState(task?.allDay ?? prefill?.allDay ?? false);
  const [date, setDate] = useState(task?.dueDate ?? prefill?.date ?? '');
  const [start, setStart] = useState(
    isoToInput(task?.startAt ?? null) || prefill?.startInput || '',
  );
  const [end, setEnd] = useState(isoToInput(task?.endAt ?? null) || prefill?.endInput || '');
  const [due, setDue] = useState(isoToInput(task?.dueAt ?? null));
  const [estimate, setEstimate] = useState(task?.estimateMinutes?.toString() ?? '');
  const [tags, setTags] = useState(task?.tags.join(', ') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const payload: TaskPayload = {
      title,
      description,
      categoryId: categoryId || null,
      urgency,
      importance,
      status,
      allDay,
      estimateMinutes: estimate ? Number(estimate) : null,
      tags: tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      ...(allDay
        ? { dueDate: date || null, startAt: null, endAt: null, dueAt: null }
        : {
            dueDate: null,
            startAt: inputToIso(start),
            endAt: inputToIso(end),
            dueAt: inputToIso(due),
          }),
    };
    setBusy(true);
    try {
      if (task) await api.updateTask(task.id, payload);
      else await api.createTask(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!task || !window.confirm(t.form.confirmDelete)) return;
    setBusy(true);
    try {
      await api.deleteTask(task.id);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t.error.generic);
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <button
        aria-label={t.form.close}
        className="flex-1 bg-black/40"
        onClick={onClose}
        tabIndex={-1}
      />
      <form
        onSubmit={submit}
        className="h-full w-full max-w-md overflow-y-auto bg-white p-4 shadow-xl dark:bg-slate-900 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 id="drawer-title" className="text-lg font-semibold">
            {task ? t.form.editTitle : t.form.newTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.form.close}
            className="rounded px-2 py-1 text-xl leading-none hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ×
          </button>
        </div>

        <div>
          <label htmlFor="f-title" className={labelCls}>
            {t.form.title}
          </label>
          <input
            id="f-title"
            ref={titleRef}
            required
            maxLength={200}
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="f-cat" className={labelCls}>
              {t.form.category}
            </label>
            <select
              id="f-cat"
              className={inputCls}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">{t.form.none}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-status" className={labelCls}>
              {t.form.status}
            </label>
            <select
              id="f-status"
              className={inputCls}
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t.status[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-urg" className={labelCls}>
              {t.form.urgency}
            </label>
            <select
              id="f-urg"
              className={inputCls}
              value={urgency}
              onChange={(e) => setUrgency(Number(e.target.value))}
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l} · {t.urgency[l]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-imp" className={labelCls}>
              {t.form.importance}
            </label>
            <select
              id="f-imp"
              className={inputCls}
              value={importance}
              onChange={(e) => setImportance(Number(e.target.value))}
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l} · {t.importance[l]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          {t.form.allDay}
        </label>

        {allDay ? (
          <div>
            <label htmlFor="f-date" className={labelCls}>
              {t.form.date}
            </label>
            <input
              id="f-date"
              type="date"
              required
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="f-start" className={labelCls}>
                {t.form.start}
              </label>
              <input
                id="f-start"
                type="datetime-local"
                className={inputCls}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="f-end" className={labelCls}>
                {t.form.end}
              </label>
              <input
                id="f-end"
                type="datetime-local"
                className={inputCls}
                value={end}
                min={start || undefined}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="f-due" className={labelCls}>
                {t.form.due}
              </label>
              <input
                id="f-due"
                type="datetime-local"
                className={inputCls}
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="f-est" className={labelCls}>
            {t.form.estimate}
          </label>
          <input
            id="f-est"
            type="number"
            min={1}
            max={1440}
            className={inputCls}
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="f-tags" className={labelCls}>
            {t.form.tags}
          </label>
          <input
            id="f-tags"
            className={inputCls}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="f-desc" className={labelCls}>
            {t.form.description}
          </label>
          <textarea
            id="f-desc"
            rows={4}
            maxLength={5000}
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? t.form.saving : t.form.save}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {t.form.cancel}
          </button>
          {task && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="ml-auto rounded px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              {t.form.delete}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

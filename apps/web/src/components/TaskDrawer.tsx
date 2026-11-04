import { useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import Attachments from './Attachments';
import Subtasks from './Subtasks';
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
  /** เชื่อม Google Calendar และเปิดซิงก์อยู่ → แสดงสวิตช์ซิงก์ต่องาน */
  gcalAvailable: boolean;
  onClose: () => void;
  /** warning = สร้าง/บันทึกงานสำเร็จแต่มีเรื่องที่ต้องแจ้งผู้ใช้ (เช่นแนบไฟล์ไม่สำเร็จ) */
  onSaved: (warning?: string) => void;
  /** ไฟล์แนบของงานที่มีอยู่เปลี่ยน โดยไม่ปิดฟอร์ม */
  onAttachmentsChanged: () => void;
  /** เปิดงานอื่นในฟอร์ม (เช่น งานแม่ของซีรีส์) */
  onOpenTask?: (task: Task) => void;
}

// ---- การทำซ้ำ (RRULE subset ตรงกับฝั่งเซิร์ฟเวอร์) ----
type Freq = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
interface RecForm {
  freq: Freq;
  interval: string;
  days: number[]; // 0 = อาทิตย์
  until: string;
}
const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const isVirtual = (id: string | null) => !!id && /~\d{4}-\d{2}-\d{2}$/.test(id);

function parseRec(rule: string | null | undefined): RecForm {
  const f: RecForm = { freq: 'NONE', interval: '1', days: [], until: '' };
  if (!rule) return f;
  const kv = Object.fromEntries(rule.split(';').map((p) => p.split('=') as [string, string]));
  if (kv.FREQ === 'DAILY' || kv.FREQ === 'WEEKLY' || kv.FREQ === 'MONTHLY') f.freq = kv.FREQ;
  if (kv.INTERVAL) f.interval = kv.INTERVAL;
  if (kv.BYDAY)
    f.days = kv.BYDAY.split(',')
      .map((c) => CODES.indexOf(c))
      .filter((d) => d >= 0);
  if (kv.UNTIL && /^\d{8}$/.test(kv.UNTIL))
    f.until = `${kv.UNTIL.slice(0, 4)}-${kv.UNTIL.slice(4, 6)}-${kv.UNTIL.slice(6)}`;
  return f;
}

/** สร้างกฎ; งานรายสัปดาห์ต้องรวมวันของวันเริ่มต้น (anchor) เสมอ */
function buildRule(f: RecForm, anchorWeekday: number | null): string | null {
  if (f.freq === 'NONE') return null;
  const parts = [`FREQ=${f.freq}`];
  const n = Math.min(99, Math.max(1, Math.round(Number(f.interval) || 1)));
  if (n > 1) parts.push(`INTERVAL=${n}`);
  if (f.freq === 'WEEKLY') {
    const days = new Set(f.days);
    if (anchorWeekday !== null) days.add(anchorWeekday);
    if (days.size)
      parts.push(
        `BYDAY=${DAY_ORDER.filter((d) => days.has(d))
          .map((d) => CODES[d])
          .join(',')}`,
      );
  }
  if (f.until) parts.push(`UNTIL=${f.until.replace(/-/g, '')}`);
  return parts.join(';');
}

const LEVELS = [1, 2, 3, 4];
const STATUSES: Status[] = ['todo', 'doing', 'done', 'cancelled'];
const inputCls =
  'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500';
const labelCls = 'block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1';

export default function TaskDrawer({
  init,
  categories,
  gcalAvailable,
  onClose,
  onSaved,
  onAttachmentsChanged,
  onOpenTask,
}: Props) {
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
  const [gcalSync, setGcalSync] = useState(task?.gcalSync ?? true);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingSubs, setPendingSubs] = useState<string[]>([]);
  const [taskId, setTaskId] = useState<string | null>(task?.id ?? null);
  const [rec, setRec] = useState<RecForm>(() => parseRec(task?.recurrenceRule));
  const isOccurrence = !!(task?.parentTaskId && task.recurrenceId);
  const inSeries = !!task?.recurrenceRule || isOccurrence;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** instance เสมือนของงานทำซ้ำ → สร้างแถวจริงก่อนแก้ checklist/ไฟล์ (คืน id จริง) */
  async function resolveId(): Promise<string | null> {
    if (taskId && isVirtual(taskId)) {
      const real = await api.materialize(taskId);
      setTaskId(real.id);
      return real.id;
    }
    return taskId;
  }

  const anchorDate = allDay ? date : (start || due).slice(0, 10);
  const anchorWeekday = anchorDate ? new Date(`${anchorDate}T00:00:00Z`).getUTCDay() : null;

  async function openSeries() {
    if (!task?.parentTaskId || !onOpenTask) return;
    try {
      onOpenTask(await api.getTask(task.parentTaskId));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t.error.generic);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!isOccurrence && rec.freq !== 'NONE' && !anchorDate) {
      setError(t.series.needsStart);
      return;
    }
    const payload: TaskPayload = {
      title,
      description,
      categoryId: categoryId || null,
      urgency,
      importance,
      status,
      allDay,
      ...(gcalAvailable ? { gcalSync } : {}),
      // การทำซ้ำตั้งได้เฉพาะงานแม่ (ครั้งที่แก้เฉพาะครั้งไม่ส่ง)
      ...(isOccurrence ? {} : { recurrenceRule: buildRule(rec, anchorWeekday) }),
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
      if (task) {
        await api.updateTask(taskId ?? task.id, payload);
        onSaved();
        return;
      }
      const created = await api.createTask(payload);
      let warning: string | undefined;
      if (pendingFiles.length) {
        try {
          await api.uploadAttachments(created.id, pendingFiles);
        } catch (err) {
          const msg = err instanceof ApiClientError ? err.message : t.error.generic;
          warning = `${t.attach.partial}: ${msg}`;
        }
      }
      for (const title of pendingSubs) {
        try {
          await api.addSubtask(created.id, title);
        } catch {
          warning ??= `${t.attach.partial}: ${t.subtasks.title}`;
        }
      }
      onSaved(warning);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  }

  async function remove(scope: 'one' | 'series' = 'one') {
    if (!task) return;
    const msg = inSeries
      ? scope === 'series'
        ? t.series.confirmDeleteSeries
        : t.series.confirmDeleteOne
      : t.form.confirmDelete;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await api.deleteTask(taskId ?? task.id, scope);
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

        {isOccurrence && (
          <p className="rounded bg-brand-50 p-2 text-xs text-brand-800 dark:bg-brand-950 dark:text-brand-200">
            🔁 {t.series.occurrenceNote}{' '}
            {onOpenTask && (
              <button
                type="button"
                onClick={() => void openSeries()}
                className="font-medium underline"
              >
                {t.series.editSeries}
              </button>
            )}
          </p>
        )}

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
        {!isOccurrence && (
          <fieldset className="space-y-2 rounded border border-slate-200 p-2 dark:border-slate-700">
            <legend className="px-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              {t.series.repeat}
            </legend>
            <label htmlFor="f-rec" className="sr-only">
              {t.series.repeat}
            </label>
            <select
              id="f-rec"
              className={inputCls}
              value={rec.freq}
              onChange={(e) => setRec({ ...rec, freq: e.target.value as Freq })}
            >
              <option value="NONE">{t.series.none}</option>
              <option value="DAILY">{t.series.daily}</option>
              <option value="WEEKLY">{t.series.weekly}</option>
              <option value="MONTHLY">{t.series.monthly}</option>
            </select>
            {rec.freq !== 'NONE' && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <label htmlFor="f-rec-int">{t.series.every}</label>
                  <input
                    id="f-rec-int"
                    type="number"
                    min={1}
                    max={99}
                    className="w-16 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800"
                    value={rec.interval}
                    onChange={(e) => setRec({ ...rec, interval: e.target.value })}
                  />
                  <span>
                    {rec.freq === 'DAILY'
                      ? t.series.unitDay
                      : rec.freq === 'WEEKLY'
                        ? t.series.unitWeek
                        : t.series.unitMonth}
                  </span>
                </div>
                {rec.freq === 'WEEKLY' && (
                  <div role="group" aria-label={t.series.onDays} className="flex flex-wrap gap-1">
                    {DAY_ORDER.map((d) => {
                      const on = rec.days.includes(d) || d === anchorWeekday; // วันของวันเริ่มต้นรวมอยู่เสมอ
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          disabled={d === anchorWeekday}
                          onClick={() =>
                            setRec({
                              ...rec,
                              days: rec.days.includes(d)
                                ? rec.days.filter((x) => x !== d)
                                : [...rec.days, d],
                            })
                          }
                          className={`h-8 w-9 rounded-full border text-xs ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'}`}
                        >
                          {t.series.weekdays[d]}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div>
                  <label htmlFor="f-rec-until" className={labelCls}>
                    {t.series.until}
                  </label>
                  <input
                    id="f-rec-until"
                    type="date"
                    className={inputCls}
                    value={rec.until}
                    min={anchorDate || undefined}
                    onChange={(e) => setRec({ ...rec, until: e.target.value })}
                  />
                </div>
              </>
            )}
          </fieldset>
        )}

        <Subtasks
          taskId={taskId}
          pending={pendingSubs}
          onPendingChange={setPendingSubs}
          resolveId={resolveId}
          onChanged={onAttachmentsChanged}
        />

        {gcalAvailable && (
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={gcalSync}
                onChange={(e) => setGcalSync(e.target.checked)}
              />
              {t.gcal.taskSwitch}
            </label>
            <p className="ml-6 text-xs text-slate-500 dark:text-slate-400">
              {t.gcal.taskSwitchHint}
              {task?.gcalSyncedAt
                ? ` · ${t.gcal.lastSynced} ${new Date(task.gcalSyncedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`
                : ''}
            </p>
          </div>
        )}

        <Attachments
          taskId={taskId}
          onResolved={setTaskId}
          pending={pendingFiles}
          onPendingChange={setPendingFiles}
          onChanged={onAttachmentsChanged}
        />

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
            className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
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
            <div className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={() => void remove('one')}
                disabled={busy}
                className="rounded px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              >
                {inSeries ? t.series.deleteOne : t.form.delete}
              </button>
              {inSeries && (
                <button
                  type="button"
                  onClick={() => void remove('series')}
                  disabled={busy}
                  className="rounded px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  {t.series.deleteSeries}
                </button>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

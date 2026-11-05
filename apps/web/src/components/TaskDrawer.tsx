import { useEffect, useRef, useState } from 'react';
import { canUndoDelete, notifyTasksChanged, restorePayload } from '../lib/undo';
import { useToast } from './UndoToast';
import { api, ApiClientError } from '../lib/api';
import Attachments from './Attachments';
import Subtasks from './Subtasks';
import { t } from '../lib/i18n';
import { dayLabel, todayYmd } from '../lib/dates';
import {
  summarizeWhen,
  validateWhen,
  whenFromTask,
  whenToPayload,
  type WhenForm,
} from '../lib/taskForm';
import DayPicker from './form/DayPicker';
import DurationPicker from './form/DurationPicker';
import TimeField24 from './form/TimeField24';
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
  const toast = useToast();
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [categoryId, setCategoryId] = useState(task?.categoryId ?? '');
  const [importance, setImportance] = useState(task?.importance ?? 2);
  const [impTouched, setImpTouched] = useState(false);
  const [status, setStatus] = useState<Status>(task?.status ?? 'todo');
  // "เมื่อไหร่": วัน (ค่าเริ่มต้น = วันนี้) + เวลา 24 ชม. + ระยะเวลา + เดดไลน์ (เลือกเพิ่ม) — ดู lib/taskForm.ts
  const [when, setWhen] = useState<WhenForm>(() => whenFromTask(task, prefill, todayYmd()));
  const patchWhen = (p: Partial<WhenForm>) => setWhen((w) => ({ ...w, ...p }));
  const [tags, setTags] = useState(task?.tags.join(', ') ?? '');
  const [gcalSync, setGcalSync] = useState(task?.gcalSync ?? true);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingSubs, setPendingSubs] = useState<string[]>([]);
  const [taskId, setTaskId] = useState<string | null>(task?.id ?? null);
  const [rec, setRec] = useState<RecForm>(() => parseRec(task?.recurrenceRule));
  const isOccurrence = !!(task?.parentTaskId && task.recurrenceId);
  const inSeries = !!task?.recurrenceRule || isOccurrence;
  const hasExtras =
    !!task &&
    !!(
      task.description ||
      task.categoryId ||
      task.tags.length ||
      task.recurrenceRule ||
      task.parentTaskId ||
      task.subtaskTotal > 0 ||
      task.attachmentCount > 0 ||
      task.status !== 'todo'
    );
  const [showMore, setShowMore] = useState(hasExtras);
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

  const anchorDate = when.day;
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
    const whenErr = validateWhen(when);
    if (whenErr) {
      setError(whenErr);
      return;
    }
    const w = whenToPayload(when);
    const payload: TaskPayload = {
      title,
      description,
      categoryId: categoryId || null,
      // ความเร่งด่วนคำนวณจากวันที่ที่ฝั่งเซิร์ฟเวอร์ (ไม่ส่งค่า); สำคัญ = ปุ่มเดียว (ไม่แตะ ถ้าผู้ใช้ไม่ได้กด จะคงค่าเดิมของงานเก่า)
      importance: impTouched || !task ? importance : task.importance,
      status,
      allDay: w.allDay,
      ...(gcalAvailable ? { gcalSync } : {}),
      // การทำซ้ำตั้งได้เฉพาะงานแม่ (ครั้งที่แก้เฉพาะครั้งไม่ส่ง)
      ...(isOccurrence ? {} : { recurrenceRule: buildRule(rec, anchorWeekday) }),
      estimateMinutes: w.estimateMinutes,
      tags: tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      startAt: w.startAt,
      endAt: w.endAt,
      dueAt: w.dueAt,
      dueDate: w.dueDate,
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
    const undoable = scope === 'one' && !inSeries && canUndoDelete(task);
    if (!undoable && !window.confirm(msg)) return;
    setBusy(true);
    try {
      await api.deleteTask(taskId ?? task.id, scope);
      if (undoable)
        toast.undo(`${t.toast.deleted}: ${task.title}`, async () => {
          await api.createTask(restorePayload(task));
          notifyTasksChanged();
        });
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

        <button
          type="button"
          aria-pressed={importance >= 3}
          onClick={() => {
            setImpTouched(true);
            setImportance(importance >= 3 ? 2 : 4);
          }}
          title={t.form2.importantHint}
          className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium ${importance >= 3 ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700'}`}
        >
          <span aria-hidden>{importance >= 3 ? '⭐' : '☆'}</span>
          {t.form2.important}
        </button>

        <section
          aria-label={t.form2.when}
          className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700"
        >
          <DayPicker
            label={t.form2.day}
            value={when.deadlineOn && !when.startTime ? '' : when.day}
            onChange={(v) => patchWhen({ day: v, ...(v ? {} : { startTime: '' }) })}
            allowNone
          />
          {when.deadlineOn && !when.startTime ? null : (
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <TimeField24
                  label={t.form2.startTime}
                  value={when.startTime}
                  onChange={(v) =>
                    patchWhen({ startTime: v, ...(v && !when.day ? { day: todayYmd() } : {}) })
                  }
                />
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {t.form2.startTimeHint}
                </p>
              </div>
            </div>
          )}
          {when.deadlineOn && !when.startTime && (
            <div>
              <TimeField24
                label={`${t.form2.startTime}`}
                value={when.startTime}
                onChange={(v) => patchWhen({ startTime: v, day: when.day || todayYmd() })}
              />
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                {t.form2.deadlineNoStart}
              </p>
            </div>
          )}
          <DurationPicker value={when.duration} onChange={(m) => patchWhen({ duration: m })} />

          {!when.deadlineOn ? (
            <button
              type="button"
              onClick={() => patchWhen({ deadlineOn: true, deadlineDate: when.day || todayYmd() })}
              className="rounded-full border border-dashed border-slate-400 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-500 dark:hover:bg-slate-800"
            >
              {t.form2.addDeadline}
            </button>
          ) : (
            <div className="space-y-2 rounded-xl bg-slate-100 p-2 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">⚑ {t.form2.deadline}</span>
                <button
                  type="button"
                  onClick={() => patchWhen({ deadlineOn: false })}
                  className="rounded-full px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
                >
                  {t.form2.removeDeadline}
                </button>
              </div>
              <DayPicker
                label={t.form2.deadline}
                value={when.deadlineDate}
                onChange={(v) => patchWhen({ deadlineDate: v })}
              />
              <div>
                <TimeField24
                  label={t.form2.deadlineTime}
                  value={when.deadlineTime}
                  onChange={(v) => patchWhen({ deadlineTime: v })}
                  emptyLabel="สิ้นวัน"
                />
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {t.form2.deadlineTimeHint}
                </p>
              </div>
            </div>
          )}

          <p
            className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900 dark:bg-brand-950 dark:text-brand-100"
            aria-live="polite"
          >
            <span className="text-xs text-slate-600 dark:text-slate-300">{t.form2.summary}: </span>
            <strong>{summarizeWhen(when, dayLabel)}</strong>
          </p>
        </section>

        <button
          type="button"
          aria-expanded={showMore}
          aria-controls="more-options"
          onClick={() => setShowMore((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <span>
            <strong>{showMore ? t.form2.less : t.form2.more}</strong>
            {!showMore && (
              <span className="ml-2 text-xs text-slate-600 dark:text-slate-300">
                {t.form2.moreHint}
              </span>
            )}
          </span>
          <span aria-hidden>{showMore ? '▴' : '▾'}</span>
        </button>

        <div id="more-options" hidden={!showMore} className="space-y-3">
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
            {task && (
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
            )}
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

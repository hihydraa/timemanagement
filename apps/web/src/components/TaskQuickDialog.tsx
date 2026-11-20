import { useEffect, useRef, useState } from 'react';
import { URGENCY_COLORS } from '../lib/colors';
import { api, ApiClientError } from '../lib/api';
import { dayLabel } from '../lib/dates';
import { t } from '../lib/i18n';
import { formatTimeRange, isoToWall } from '../lib/time';
import type { Status, Task } from '../lib/types';
import TaskMeta from './TaskMeta';

const STATUSES: Status[] = ['todo', 'doing', 'done', 'cancelled'];
const isVirtual = (id: string) => /~\d{4}-\d{2}-\d{2}$/.test(id);

/**
 * ป๊อปอัปของงาน (เปิดจากไทม์ไลน์/รายการ): ดูสรุปและเปลี่ยนสถานะได้ทันที
 * แก้รายละเอียดทั้งหมดได้ผ่านปุ่ม "แก้ไขเต็ม" (เปิดฟอร์มเดิม)
 */
export default function TaskQuickDialog({
  task,
  onClose,
  onChanged,
  onEdit,
}: {
  task: Task;
  onClose: () => void;
  /** เรียกหลังเปลี่ยนสถานะ/เลื่อนสำเร็จ (ให้หน้าแม่โหลดข้อมูลใหม่) */
  onChanged: () => void;
  onEdit: (task: Task) => void;
}) {
  const [status, setStatus] = useState<Status>(task.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const cb = useRef({ onClose, onChanged });
  cb.current = { onClose, onChanged };

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cb.current.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** งานทำซ้ำที่ยังเป็นครั้งเสมือน → สร้างแถวจริงก่อนแก้ */
  const realId = async () => (isVirtual(task.id) ? (await api.materialize(task.id)).id : task.id);

  async function act(fn: (id: string) => Promise<unknown>, after?: () => void) {
    setError('');
    setBusy(true);
    try {
      await fn(await realId());
      after?.();
      cb.current.onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  }

  const choose = (next: Status) => {
    if (next === status || busy) return;
    void act(
      (id) => (next === 'done' ? api.completeTask(id) : api.updateTask(id, { status: next })),
      () => setStatus(next),
    );
  };
  const snooze = () =>
    void act(
      (id) => api.snoozeTask(id, { days: 1 }),
      () => cb.current.onClose(),
    );

  const when = formatTimeRange(task);
  const day = task.startAt
    ? isoToWall(task.startAt).slice(0, 10)
    : (task.dueDate ?? (task.dueAt ? isoToWall(task.dueAt).slice(0, 10) : null));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-2xl border-l-8 bg-white p-4 shadow-xl dark:bg-slate-900"
        style={{ borderLeftColor: URGENCY_COLORS[task.urgency] }}
      >
        <div className="flex items-start justify-between gap-2">
          <h2
            id="quick-title"
            className={`text-lg font-semibold ${status === 'done' || status === 'cancelled' ? 'line-through opacity-70' : ''}`}
          >
            {task.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t.form.close}
            className="rounded px-2 py-1 text-xl leading-none hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ×
          </button>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-slate-600 dark:text-slate-300">
          {day && <span>{dayLabel(day)}</span>}
          {when && <span className="tabular-nums">{when}</span>}
          <TaskMeta task={{ ...task, status }} />
        </p>
        {task.description && (
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-sm">{task.description}</p>
        )}

        <fieldset disabled={busy}>
          <legend className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            {t.form.status}
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => choose(s)}
                className={`rounded-lg border px-2 py-2 text-sm ${status === s ? 'border-brand-600 bg-brand-600 font-medium text-white' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'}`}
              >
                {status === s && <span aria-hidden>✓ </span>}
                {t.status[s]}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p
            role="alert"
            className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || status === 'done' || status === 'cancelled'}
            onClick={snooze}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            ⏰ {t.cockpit.snooze}
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            ✎ {t.quickDialog.edit}
          </button>
        </div>
      </div>
    </div>
  );
}

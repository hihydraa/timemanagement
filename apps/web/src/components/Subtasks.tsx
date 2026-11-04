import { useCallback, useEffect, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { t } from '../lib/i18n';
import type { Subtask } from '../lib/types';

interface Props {
  /** งานที่มีอยู่แล้ว (อาจเป็น id เสมือนของงานทำซ้ำ); null = งานใหม่ เก็บรายการไว้รอสร้างพร้อมงาน */
  taskId: string | null;
  pending: string[];
  onPendingChange: (titles: string[]) => void;
  /** สร้างแถวจริงของ instance เสมือนก่อนแก้ checklist → คืน id จริง */
  resolveId: () => Promise<string | null>;
  onChanged: () => void;
}

export default function Subtasks({
  taskId,
  pending,
  onPendingChange,
  resolveId,
  onChanged,
}: Props) {
  const [items, setItems] = useState<Subtask[]>([]);
  const [template, setTemplate] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(
    async (id: string | null = taskId) => {
      if (!id) return [] as Subtask[];
      try {
        const r = await api.listSubtasks(id);
        setItems(r.subtasks);
        setTemplate(r.template);
        return r.subtasks;
      } catch {
        return [] as Subtask[];
      }
    },
    [taskId],
  );
  useEffect(() => void reload(), [reload]);

  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
      void reload(); // ย้อนค่าที่เปลี่ยนในหน้าทันทีกลับให้ตรงกับเซิร์ฟเวอร์
    } finally {
      setBusy(false);
    }
  }

  /** แก้รายการของ instance เสมือน: สร้างแถวจริง (คัดลอกรายการจากแม่) แล้วหารายการที่ตรงกับตำแหน่งเดิม */
  async function targetFor(item: Subtask): Promise<Subtask | null> {
    if (!template) return item;
    const idx = items.findIndex((x) => x.id === item.id);
    const realId = await resolveId();
    const fresh = await reload(realId);
    return fresh[idx] ?? null;
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    setText('');
    if (!taskId) {
      onPendingChange([...pending, v]);
      return;
    }
    void guard(async () => {
      const r = await api.addSubtask(taskId, v); // เซิร์ฟเวอร์สร้างแถวจริงให้ถ้าเป็น instance เสมือน
      if (r.taskId !== taskId) await resolveId();
      await reload(r.taskId);
    });
  };

  const toggle = (item: Subtask) => {
    // เปลี่ยนในหน้าทันที (optimistic)
    setItems((cur) => cur.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)));
    return guard(async () => {
      const target = await targetFor(item);
      if (!target) return;
      await api.updateSubtask(target.id, { done: !item.done });
      await reload(target.taskId);
    });
  };

  const remove = (item: Subtask) =>
    guard(async () => {
      const target = await targetFor(item);
      if (!target) return;
      await api.deleteSubtask(target.id);
      await reload(target.taskId);
    });

  const doneCount = items.filter((i) => i.done).length;

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
        {t.subtasks.title}
        {items.length > 0 && ` · ${doneCount}/${items.length}`}
      </legend>
      {template && items.length > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{t.subtasks.template}</p>
      )}

      <ul className="space-y-1">
        {items.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.done}
              disabled={busy}
              onChange={() => void toggle(s)}
              aria-label={s.title}
            />
            <span
              className={`min-w-0 flex-1 break-words ${s.done ? 'text-slate-400 line-through' : ''}`}
            >
              {s.title}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(s)}
              aria-label={`${t.subtasks.remove}: ${s.title}`}
              className="rounded px-2 py-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              ✕
            </button>
          </li>
        ))}
        {pending.map((p, i) => (
          <li key={`${p}-${i}`} className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled aria-label={p} />
            <span className="min-w-0 flex-1 break-words">
              {p} <span className="text-xs text-slate-500">· {t.subtasks.pendingNote}</span>
            </span>
            <button
              type="button"
              onClick={() => onPendingChange(pending.filter((_, j) => j !== i))}
              aria-label={`${t.subtasks.remove}: ${p}`}
              className="rounded px-2 py-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <label htmlFor="f-sub" className="sr-only">
          {t.subtasks.add}
        </label>
        <input
          id="f-sub"
          value={text}
          maxLength={200}
          placeholder={t.subtasks.addPlaceholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add(e); // Enter เพิ่มรายการ ไม่ submit ฟอร์มงาน
          }}
          className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
        />
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={add}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          {t.subtasks.add}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}
    </fieldset>
  );
}

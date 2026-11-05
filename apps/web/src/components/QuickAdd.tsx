import { useMemo, useState, type RefObject } from 'react';
import { api, ApiClientError } from '../lib/api';
import { dayLabel, todayYmd, tomorrow } from '../lib/dates';
import { t } from '../lib/i18n';
import {
  applyOverrides,
  buildQuickPayload,
  parseQuickAdd,
  tmpTaskFromPayload,
  type QuickOverrides,
} from '../lib/quickAdd';
import { summarizeWhen, type WhenForm } from '../lib/taskForm';
import type { Category, Task } from '../lib/types';
import DayPicker from './form/DayPicker';
import DurationPicker from './form/DurationPicker';
import TimeField24 from './form/TimeField24';
import Popover from './Popover';
import { useToast } from './UndoToast';

const addMin = (hm: string, m: number) => {
  const total = (Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) + m) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const dayName = (ymd: string) =>
  ymd === todayYmd() ? t.form2.today : ymd === tomorrow() ? t.form2.tomorrow : dayLabel(ymd);
const staticChip =
  'inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800';

/**
 * Quick Add: พิมพ์ประโยคเดียว + Enter = บันทึกทันที (ใช้ parser ภาษาไทยตัวเดียวกับ LINE)
 * ใต้ช่องมีชิปพรีวิว (วัน เวลา เดดไลน์ สำคัญ ประเภท) กดแก้ได้ก่อนบันทึก; บันทึกแล้วขึ้น toast "เลิกทำ"
 */
export default function QuickAdd({
  categories,
  inputRef,
  onPending,
  onSettled,
  onCreated,
}: {
  categories: Category[];
  inputRef: RefObject<HTMLInputElement | null>;
  /** งานชั่วคราวที่แสดงทันที (optimistic) */
  onPending: (task: Task) => void;
  /** เซิร์ฟเวอร์ตอบแล้ว (สำเร็จหรือล้มเหลว) → เอางานชั่วคราวออก */
  onSettled: (tmpId: string) => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [over, setOver] = useState<QuickOverrides>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayYmd();

  const q = useMemo(
    () => applyOverrides(parseQuickAdd(text, new Date(), today, categories), over),
    [text, over, categories, today],
  );
  const setWhen = (p: Partial<WhenForm>) =>
    setOver((o) => ({ ...o, when: { ...(o.when ?? {}), ...p } }));
  const w = q.when;
  const noWhen = !w.day && !(w.deadlineOn && w.deadlineDate);

  async function submit() {
    if (busy) return;
    const r = buildQuickPayload(q);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setError('');
    const original = text;
    const tmp = tmpTaskFromPayload(r.payload, `tmp-${Date.now()}`, new Date());
    onPending(tmp); // ขึ้นรายการทันที
    setText('');
    setOver({});
    setBusy(true);
    try {
      const created = await api.createTask(r.payload);
      onSettled(tmp.id);
      onCreated();
      toast.undo(`${t.quick.added}: ${created.title}`, async () => {
        await api.deleteTask(created.id);
        onCreated();
      });
    } catch (e) {
      onSettled(tmp.id);
      setText(original); // ไม่ทำให้ข้อความที่พิมพ์หาย
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const dashed =
    'inline-flex items-center rounded-full border border-dashed border-slate-400 px-3 py-1.5 text-xs text-slate-700 dark:border-slate-500 dark:text-slate-200';
  const showChips = text.trim().length > 0;

  return (
    <section aria-label={t.quick.title} className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex gap-2"
      >
        <label htmlFor="quick-add" className="sr-only">
          {t.quick.title}
        </label>
        <input
          id="quick-add"
          ref={inputRef}
          value={text}
          maxLength={300}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => {
            setText(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            // ระหว่างพิมพ์ไทยด้วย IME การกด Enter ยืนยันคำ ต้องไม่ถือเป็นการบันทึก
            if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault();
          }}
          placeholder={t.quick.placeholder}
          className="min-w-0 flex-1 rounded-2xl border-2 border-brand-300 bg-white px-4 py-3 text-base shadow-sm focus:border-brand-600 focus-visible:outline-none dark:border-brand-700 dark:bg-slate-800"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded-2xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
        >
          {t.quick.add}
        </button>
      </form>

      {showChips && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label={t.quick.preview}>
          <Popover
            label={
              noWhen
                ? t.quick.unscheduled
                : w.deadlineOn && !w.startTime
                  ? t.quick.unscheduled
                  : dayName(w.day)
            }
            icon="📅"
            width="w-72"
          >
            <DayPicker
              label={t.form2.day}
              value={w.day}
              onChange={(v) => setWhen({ day: v, ...(v ? {} : { startTime: '' }) })}
              allowNone
            />
          </Popover>
          {w.startTime ? (
            <Popover
              label={`${w.startTime}–${addMin(w.startTime, w.duration)}`}
              icon="🕒"
              width="w-72"
            >
              <div className="space-y-3">
                <TimeField24
                  label={t.form2.startTime}
                  value={w.startTime}
                  onChange={(v) => setWhen({ startTime: v })}
                />
                <DurationPicker value={w.duration} onChange={(m) => setWhen({ duration: m })} />
              </div>
            </Popover>
          ) : (
            <Popover label={t.quick.addTime} icon="🕒" width="w-72">
              <div className="space-y-3">
                <TimeField24
                  label={t.form2.startTime}
                  value={w.startTime}
                  onChange={(v) =>
                    setWhen({ startTime: v, ...(v && !w.day ? { day: today } : {}) })
                  }
                />
                <DurationPicker value={w.duration} onChange={(m) => setWhen({ duration: m })} />
              </div>
            </Popover>
          )}
          {w.deadlineOn ? (
            <Popover
              label={`${t.form2.deadline} ${dayName(w.deadlineDate)}${w.deadlineTime ? ` ${w.deadlineTime}` : ''}`}
              icon="⚑"
              width="w-72"
            >
              <div className="space-y-3">
                <DayPicker
                  label={t.form2.deadline}
                  value={w.deadlineDate}
                  onChange={(v) => setWhen({ deadlineDate: v })}
                />
                <TimeField24
                  label={t.form2.deadlineTime}
                  value={w.deadlineTime}
                  onChange={(v) => setWhen({ deadlineTime: v })}
                  emptyLabel="สิ้นวัน"
                />
                <button
                  type="button"
                  onClick={() => setWhen({ deadlineOn: false })}
                  className="text-xs text-red-700 underline dark:text-red-300"
                >
                  {t.form2.removeDeadline}
                </button>
              </div>
            </Popover>
          ) : (
            <button
              type="button"
              onClick={() => setWhen({ deadlineOn: true, deadlineDate: w.day || today })}
              className={dashed}
            >
              {t.form2.addDeadline}
            </button>
          )}
          <button
            type="button"
            aria-pressed={q.important}
            onClick={() => setOver((o) => ({ ...o, important: !q.important }))}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium ${q.important ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700'}`}
          >
            <span aria-hidden>{q.important ? '⭐' : '☆'}</span>
            {t.form2.important}
          </button>
          {q.categoryName && <span className={staticChip}>#{q.categoryName}</span>}
          {q.tags.map((tg) => (
            <span key={tg} className={staticChip}>
              @{tg}
            </span>
          ))}
          {q.recurrence && <span className={staticChip}>🔁 {t.series.repeat}</span>}
        </div>
      )}
      {showChips && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {t.form2.summary}: <strong>{q.title ? q.title : '…'}</strong> ·{' '}
          {summarizeWhen(w, dayLabel)} · {t.quick.enterHint}
        </p>
      )}
      {showChips && q.pastWarning && (
        <p
          role="status"
          className="rounded bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          ⚠ {q.pastWarning} — {t.quick.pastHint}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}
    </section>
  );
}

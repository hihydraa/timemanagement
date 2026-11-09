import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { t } from '../lib/i18n';
import type { Alarm } from '../lib/types';
import TimeField24 from './form/TimeField24';
import WebPushSettings from './WebPushSettings';

const ALL = [1, 2, 3, 4, 5, 6, 7];

const daysText = (a: Alarm) =>
  a.days.length === 0
    ? `${t.alarms.once}${a.onceDate ? ` (${a.onceDate})` : ''}`
    : a.days.length === 7
      ? t.alarms.everyDay
      : a.days.map((d) => t.work.dayNames[d - 1]).join(' ');

/** นาฬิกาปลุก: เด้งเป็นการแจ้งเตือนเร่งด่วนตรงเวลาบนโทรศัพท์ (Web Push) + ส่งเข้าปฏิทินมือถือ (ICS) */
export default function AlarmsDialog({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<Alarm[] | null>(null);
  const [time, setTime] = useState('07:00');
  const [label, setLabel] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const m = t.alarms;

  const load = useCallback(() => {
    api
      .listAlarms()
      .then(setList)
      .catch(() => setError(t.error.loadFailed));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
  const chip = (on: boolean) =>
    `h-9 min-w-9 rounded-full border px-2 text-sm ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'}`;
  const small =
    'rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarm-title"
    >
      <div className="max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 id="alarm-title" className="text-lg font-semibold">
            ⏰ {m.title}
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
        <p className="text-xs text-slate-600 dark:text-slate-300">{m.intro}</p>

        <WebPushSettings />

        <form
          className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api.createAlarm({ time, label: label.trim(), days });
              setLabel('');
            });
          }}
        >
          <h3 className="text-sm font-semibold">{m.add}</h3>
          <TimeField24 label={m.time} value={time} clearable={false} onChange={setTime} />
          <div>
            <label htmlFor="alarm-label" className="mb-1 block text-xs font-medium">
              {m.label}
            </label>
            <input
              id="alarm-label"
              value={label}
              maxLength={80}
              placeholder={m.labelPh}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </div>
          <div role="group" aria-label={m.repeat} className="flex flex-wrap items-center gap-1.5">
            {t.work.dayNames.map((name, i) => {
              const d = i + 1;
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  title={t.work.dayFull[i]}
                  className={chip(on)}
                  onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d].sort())}
                >
                  {name}
                </button>
              );
            })}
            <button
              type="button"
              className={small}
              onClick={() => setDays(days.length === 7 ? [] : ALL)}
            >
              {days.length === 7 ? m.clear : m.all}
            </button>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {days.length ? m.repeatHint : m.onceHint}
          </p>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {m.save}
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

        <ul className="space-y-2" aria-label={m.title}>
          {list?.length === 0 && (
            <li className="text-sm text-slate-600 dark:text-slate-300">{m.empty}</li>
          )}
          {list?.map((a) => (
            <li
              key={a.id}
              className={`rounded-xl border border-slate-200 p-3 dark:border-slate-700 ${a.enabled ? '' : 'opacity-60'}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold tabular-nums">{a.time}</span>
                <span className="min-w-0 flex-1 text-sm">
                  <strong className="block truncate">{a.label || m.defaultLabel}</strong>
                  <span className="text-xs text-slate-600 dark:text-slate-300">{daysText(a)}</span>
                </span>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    checked={a.enabled}
                    disabled={busy}
                    onChange={(e) =>
                      void run(() => api.patchAlarm(a.id, { enabled: e.target.checked }))
                    }
                  />
                  {m.on}
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={`/api/alarms/${a.id}/ics`} className={small} download>
                  {m.ics}
                </a>
                <button
                  type="button"
                  className={small}
                  disabled={busy}
                  onClick={() => void run(() => api.deleteAlarm(a.id))}
                >
                  {m.remove}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500 dark:text-slate-400">{m.limits}</p>
      </div>
    </div>
  );
}

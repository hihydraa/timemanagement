import { useState } from 'react';
import { useEffect, useRef } from 'react';
import { api, ApiClientError } from '../../lib/api';
import HoursSelect from '../HoursSelect';
import { offDuration } from '../../lib/daysOff';
import type { DashboardData } from '../../lib/dashboard';
import { dayLabel } from '../../lib/dates';
import { KINDS, STYLE, kindTh } from '../../lib/daysOffStyle';
import { t } from '../../lib/i18n';
import { todayYmd } from '../../lib/time';
import type { DayOffKind } from '../../lib/types';

const field =
  'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800';

/** การ์ดวันหยุดบนแดชบอร์ด: สถานะวันนี้ สรุปปีนี้ วันหยุดที่จะถึง และเพิ่มวันหยุดได้ทันที (ไม่ต้องไปหน้าอื่น) */
export default function DaysOffPanel({
  d,
  onChanged,
  onGo,
}: {
  d: DashboardData;
  /** เรียกหลังบันทึกสำเร็จ (ให้หน้าแม่โหลดข้อมูลใหม่) */
  onChanged: () => void;
  onGo: () => void;
}) {
  const w = t.dash.leave;
  const l = d.leave;
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(todayYmd());
  const [to, setTo] = useState('');
  const [kind, setKind] = useState<DayOffKind>('vacation');
  const [note, setNote] = useState('');
  const [onlyWork, setOnlyWork] = useState(true);
  const [hours, setHours] = useState('');
  const root = useRef<HTMLElement>(null);

  // ปุ่ม "+ เพิ่มวันหยุด" ที่หัวหน้าแดชบอร์ดเปิดฟอร์มนี้และเลื่อนมาที่การ์ด
  useEffect(() => {
    const on = () => {
      setMsg('');
      setOpen(true);
      root.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.addEventListener('dobby:add-day-off', on);
    return () => window.removeEventListener('dobby:add-day-off', on);
  }, []);
  const single = !to || to === from;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.addDaysOff({
        from,
        ...(to ? { to } : {}),
        kind,
        note: note.trim(),
        onlyWorkDays: onlyWork,
        ...(single && hours ? { hours: Number(hours) } : {}),
      });
      setMsg(t.daysOff.saved.replace('{c}', String(r.created)).replace('{u}', String(r.updated)));
      setOpen(false);
      setTo('');
      setNote('');
      setHours('');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  };

  const kindsWithDays = KINDS.filter((k) => l.summary.byKind[k] > 0);
  return (
    <section
      ref={root}
      id="days-off-panel"
      aria-label={w.title}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">🏖 {w.title}</h2>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onGo}
          className="text-xs text-iris-600 underline dark:text-iris-400"
        >
          {w.all}
        </button>
      </div>

      <p className="mt-2 text-sm" role="status">
        {l.today ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ${STYLE[l.today.kind].cls}`}
          >
            <span aria-hidden>{STYLE[l.today.kind].icon}</span>
            {w.todayOff.replace('{k}', kindTh(l.today.kind))}
            {l.today.minutes > 0 && <span> · {offDuration(l.today.minutes)}</span>}
            {l.today.note && <span className="font-normal"> · {l.today.note}</span>}
          </span>
        ) : (
          <span className="text-slate-600 dark:text-slate-300">{w.todayWork}</span>
        )}
      </p>

      <div className="mt-2">
        <p className="text-xs font-semibold">
          {l.summary.total > 0
            ? w.yearTotal
                .replace('{y}', String(l.year + 543))
                .replace('{n}', String(l.summary.total))
            : w.none}
        </p>
        {kindsWithDays.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {kindsWithDays.map((k) => (
              <li
                key={k}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${STYLE[k].cls}`}
              >
                <span aria-hidden>{STYLE[k].icon}</span>
                {kindTh(k)}
                <strong className="tabular-nums">{l.summary.byKind[k]}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-2">
        <p className="text-xs font-semibold">{w.upcoming}</p>
        {l.upcoming.length === 0 ? (
          <p className="text-xs text-slate-600 dark:text-slate-300">{w.noUpcoming}</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {l.upcoming.map((x) => (
              <li key={x.id} className="flex items-center gap-2">
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs ${STYLE[x.kind].cls}`}
                >
                  <span aria-hidden>{STYLE[x.kind].icon}</span>
                  {kindTh(x.kind)}
                </span>
                <span className="shrink-0 tabular-nums">
                  {dayLabel(x.date)}
                  {x.minutes > 0 && ` · ${offDuration(x.minutes)}`}
                </span>
                <span className="truncate text-xs text-slate-600 dark:text-slate-300">
                  {x.note}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {msg && !open && (
        <p role="status" className="mt-2 text-xs text-brand-700 dark:text-brand-300">
          {msg}
        </p>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => {
            setMsg('');
            setOpen(true);
          }}
          className="mt-3 rounded-full border border-slate-300 px-3 py-1.5 text-sm hover:bg-cool-100 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          + {w.add}
        </button>
      ) : (
        <form
          onSubmit={submit}
          className="mt-3 space-y-2 rounded-xl bg-cool-50 p-3 dark:bg-slate-900"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs">
              {t.daysOff.from}
              <input
                type="date"
                required
                className={field}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="block text-xs">
              {t.daysOff.to}
              <input
                type="date"
                min={from}
                className={field}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <HoursSelect value={hours} onChange={setHours} disabled={!single} className={field} />
          <label className="block text-xs">
            {t.daysOff.kind}
            <select
              className={field}
              value={kind}
              onChange={(e) => setKind(e.target.value as DayOffKind)}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {STYLE[k].icon} {kindTh(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            {t.daysOff.note}
            <input
              className={field}
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={onlyWork}
              onChange={(e) => setOnlyWork(e.target.checked)}
            />
            {t.daysOff.onlyWorkDays}
          </label>
          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? t.daysOff.saving : t.daysOff.save}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm hover:bg-cool-100 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              {w.cancel}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

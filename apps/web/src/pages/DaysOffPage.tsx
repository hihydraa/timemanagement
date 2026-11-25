import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { dayLabel } from '../lib/dates';
import HoursSelect from '../components/HoursSelect';
import { offDuration } from '../lib/daysOff';
import { KINDS, STYLE, kindTh } from '../lib/daysOffStyle';
import { monthGrid, monthTitle, shiftMonth } from '../lib/dashboard';
import { t } from '../lib/i18n';
import { todayYmd } from '../lib/time';
import type { DayOff, DayOffKind, DaysOffList } from '../lib/types';

const WEEK = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

const field =
  'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800';
const btn =
  'rounded-full border border-slate-300 px-3 py-1.5 text-sm hover:bg-cool-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800';
const primary =
  'rounded-full bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50';

/** แท็บ "วันหยุด": บันทึกว่าหยุดงานวันไหนไปบ้าง ปฏิทินรายเดือน + สรุปรายปีตามประเภท + รายการ */
export default function DaysOffPage() {
  const [month, setMonth] = useState(() => todayYmd().slice(0, 7));
  const year = month.slice(0, 4);
  const [data, setData] = useState<DaysOffList | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [pickKind, setPickKind] = useState<DayOffKind>('vacation');
  const [pickNote, setPickNote] = useState('');
  const [from, setFrom] = useState(todayYmd());
  const [to, setTo] = useState('');
  const [kind, setKind] = useState<DayOffKind>('vacation');
  const [note, setNote] = useState('');
  const [onlyWork, setOnlyWork] = useState(true);
  const [hours, setHours] = useState('');
  const [pickHours, setPickHours] = useState('');
  const single = !to || to === from;

  const load = useCallback(() => {
    api
      .listDaysOff(`${year}-01-01`, `${year}-12-31`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch(() => setError(t.daysOff.loadFailed));
  }, [year]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const byDate = useMemo(() => new Map((data?.daysOff ?? []).map((d) => [d.date, d])), [data]);
  const grid = useMemo(() => monthGrid(month), [month]);
  const today = todayYmd();

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  };

  const openDay = (ymd: string) => {
    const cur = byDate.get(ymd);
    setPick(ymd);
    setPickKind(cur?.kind ?? 'vacation');
    setPickNote(cur?.note ?? '');
    setPickHours(cur && cur.minutes > 0 ? String(cur.minutes / 60) : '');
    setNotice('');
  };
  const savePick = () =>
    pick &&
    run(async () => {
      await api.addDaysOff({
        from: pick,
        kind: pickKind,
        note: pickNote.trim(),
        onlyWorkDays: false,
        ...(pickHours ? { hours: Number(pickHours) } : {}),
      });
      setPick(null);
    });
  const remove = (d: DayOff) => {
    if (!window.confirm(t.daysOff.confirmRemove.replace('{d}', dayLabel(d.date)))) return;
    void run(async () => {
      await api.deleteDayOff(d.id);
      setPick(null);
    });
  };
  const submitRange = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await api.addDaysOff({
        from,
        ...(to ? { to } : {}),
        kind,
        note: note.trim(),
        onlyWorkDays: onlyWork,
        ...(single && hours ? { hours: Number(hours) } : {}),
      });
      setNotice(
        t.daysOff.saved.replace('{c}', String(r.created)).replace('{u}', String(r.updated)),
      );
      setMonth(from.slice(0, 7));
      setNote('');
      setHours('');
    });
  };

  const cur = pick ? byDate.get(pick) : undefined;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">{t.daysOff.intro}</p>

      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <section aria-label={t.daysOff.year} className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={btn}
            aria-label={`${t.daysOff.year} ${Number(year) + 542}`}
            onClick={() => setMonth(`${Number(year) - 1}-${month.slice(5)}`)}
          >
            ‹
          </button>
          <h2 className="text-base font-semibold">
            {t.daysOff.year} {Number(year) + 543}
          </h2>
          <button
            type="button"
            className={btn}
            aria-label={`${t.daysOff.year} ${Number(year) + 544}`}
            onClick={() => setMonth(`${Number(year) + 1}-${month.slice(5)}`)}
          >
            ›
          </button>
          <span className="flex-1" />
          <span className="text-sm font-medium" aria-live="polite">
            {data ? t.daysOff.total.replace('{n}', String(data.summary.total)) : t.loading}
          </span>
        </div>
        <ul className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <li
              key={k}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${STYLE[k].cls}`}
            >
              <span aria-hidden>{STYLE[k].icon}</span>
              {kindTh(k)}
              <strong className="tabular-nums">{data?.summary.byKind[k] ?? 0}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-label={monthTitle(month)}
        className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            className={btn}
            aria-label="เดือนก่อนหน้า"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ‹
          </button>
          <h3 className="flex-1 text-center text-sm font-semibold">{monthTitle(month)}</h3>
          <button
            type="button"
            className={btn}
            aria-label="เดือนถัดไป"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center" role="grid">
          {WEEK.map((w) => (
            <div key={w} className="py-1 text-xs text-slate-600 dark:text-slate-300">
              {w}
            </div>
          ))}
          {grid.flat().map((c, i) => {
            if (!c.ymd) return <div key={i} />;
            const off = byDate.get(c.ymd);
            const st = off ? STYLE[off.kind] : null;
            return (
              <button
                key={c.ymd}
                type="button"
                onClick={() => openDay(c.ymd!)}
                aria-pressed={pick === c.ymd}
                aria-label={`${dayLabel(c.ymd)}${off ? ` — ${t.daysOff.isOff}: ${kindTh(off.kind)}${off.note ? ` (${off.note})` : ''}` : ''}`}
                className={`flex h-11 flex-col items-center justify-center rounded-lg text-sm ${st ? st.cls : 'hover:bg-cool-100 dark:hover:bg-slate-700'} ${c.ymd === today ? 'ring-2 ring-brand-500' : ''} ${pick === c.ymd ? 'outline outline-2 outline-brand-700' : ''}`}
              >
                <span className="tabular-nums">{c.day}</span>
                {st && (
                  <span aria-hidden className="text-[10px] leading-none">
                    {st.icon}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{t.daysOff.legend}</p>

        {pick && (
          <div className="mt-3 space-y-2 rounded-xl bg-cool-50 p-3 dark:bg-slate-900">
            <h4 className="text-sm font-semibold">
              {t.daysOff.dayDialog.replace('{d}', dayLabel(pick))}
            </h4>
            <HoursSelect value={pickHours} onChange={setPickHours} className={field} />
            <label className="block text-xs">
              {t.daysOff.kind}
              <select
                className={field}
                value={pickKind}
                onChange={(e) => setPickKind(e.target.value as DayOffKind)}
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
                value={pickNote}
                onChange={(e) => setPickNote(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className={primary}
                onClick={() => void savePick()}
              >
                {cur ? t.daysOff.save : t.daysOff.markOff}
              </button>
              {cur && (
                <button type="button" disabled={busy} className={btn} onClick={() => remove(cur)}>
                  {t.daysOff.remove}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <form
        onSubmit={submitRange}
        className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
      >
        <h3 className="text-sm font-semibold">{t.daysOff.addTitle}</h3>
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
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={onlyWork}
            onChange={(e) => setOnlyWork(e.target.checked)}
          />
          {t.daysOff.onlyWorkDays}
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className={primary}>
            {busy ? t.daysOff.saving : t.daysOff.save}
          </button>
          {notice && (
            <span role="status" className="text-sm text-brand-700 dark:text-brand-300">
              {notice}
            </span>
          )}
        </div>
      </form>

      <section aria-label={t.daysOff.list} className="space-y-1">
        <h3 className="text-sm font-semibold">
          {t.daysOff.list} ({Number(year) + 543})
        </h3>
        {data && data.daysOff.length === 0 && (
          <p className="text-sm text-slate-600 dark:text-slate-300">{t.daysOff.empty}</p>
        )}
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {[...(data?.daysOff ?? [])].reverse().map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-1.5 text-sm">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline"
                onClick={() => {
                  setMonth(d.date.slice(0, 7));
                  openDay(d.date);
                }}
              >
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs ${STYLE[d.kind].cls}`}
                >
                  <span aria-hidden>{STYLE[d.kind].icon}</span>
                  {kindTh(d.kind)}
                </span>
                <span className="shrink-0 tabular-nums">
                  {dayLabel(d.date)}
                  {d.minutes > 0 && ` · ${offDuration(d.minutes)}`}
                </span>
                <span className="truncate text-slate-600 dark:text-slate-300">{d.note}</span>
              </button>
              <button
                type="button"
                disabled={busy}
                className="shrink-0 text-xs text-red-700 underline dark:text-red-300"
                onClick={() => remove(d)}
              >
                {t.daysOff.remove}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

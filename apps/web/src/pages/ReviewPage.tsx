import { useCallback, useEffect, useState } from 'react';
import CategoryBars from '../components/CategoryBars';
import { api, ApiClientError } from '../lib/api';
import {
  addDaysYmd,
  dayLabel,
  defaultReviewWeek,
  formatMinutes,
  mondayOf,
  todayYmd,
  weekLabel,
} from '../lib/dates';
import Mascot from '../components/Mascot';
import { t } from '../lib/i18n';
import type { BriefTask, WeeklyStats } from '../lib/types';

const Card = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
    <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    <div className="text-2xl font-bold">{value}</div>
    {hint && <div className="text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
  </div>
);

export default function ReviewPage() {
  const thisMonday = mondayOf(todayYmd());
  const today = todayYmd();
  const [week, setWeek] = useState(() => defaultReviewWeek(today)); // จ–พ = สัปดาห์ที่แล้ว, พฤ–อา = สัปดาห์นี้
  const [data, setData] = useState<WeeklyStats | null>(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [day, setDay] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError('');
    api
      .weekly(week)
      .then(setData)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : t.error.loadFailed));
  }, [week]);
  useEffect(load, [load]);

  const nextDays = data
    ? Array.from({ length: 7 }, (_, i) => addDaysYmd(data.nextWeek.weekStart, i))
    : [];
  useEffect(() => {
    if (nextDays.length && !nextDays.includes(day)) setDay(nextDays[0]!);
  }, [nextDays, day]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const v = title.trim();
    if (!v || !day) return;
    setBusy(true);
    setError('');
    try {
      await api.createTask({ title: v, allDay: true, dueDate: day });
      setTitle('');
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  }

  const list = (items: BriefTask[]) => (
    <ul className="space-y-1">
      {items.length === 0 && <li className="text-sm text-slate-500">{t.review.nothing}</li>}
      {items.map((x) => (
        <li
          key={x.id}
          className="flex items-start gap-2 rounded border border-slate-200 p-2 text-sm dark:border-slate-700"
        >
          {x.status === 'done' ? (
            <span
              role="img"
              aria-label={t.status.done}
              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-600 text-[10px] text-white"
            >
              ✓
            </span>
          ) : (
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-slate-400 checked:border-green-600 checked:bg-green-600 dark:border-slate-300"
              aria-label={`${t.today.complete}: ${x.title}`}
              onChange={() => void api.completeTask(x.id).then(load)}
            />
          )}
          <span className="min-w-0 flex-1 break-words">{x.title}</span>
          {x.date && <span className="shrink-0 text-xs text-slate-500">{dayLabel(x.date)}</span>}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">{t.review.title}</h2>
        <div
          role="group"
          aria-label={t.review.pickWeek}
          className="flex overflow-hidden rounded-full border border-slate-300 text-sm dark:border-slate-600"
        >
          {[addDaysYmd(thisMonday, -7), thisMonday].map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={week === w}
              onClick={() => setWeek(w)}
              className={`px-3 py-1.5 ${week === w ? 'bg-brand-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              {weekLabel(w, today)}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label={t.review.prev}
          onClick={() => setWeek(addDaysYmd(week, -7))}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          ‹
        </button>
        <span data-testid="week-range" className="text-sm font-medium">
          <strong>{weekLabel(week, today)}</strong>{' '}
          {data ? `${dayLabel(data.weekStart)} – ${dayLabel(data.weekEnd)}` : week}
        </span>
        <button
          type="button"
          aria-label={t.review.next}
          disabled={week >= thisMonday}
          onClick={() => setWeek(addDaysYmd(week, 7))}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          ›
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}
      {!data && !error && <p role="status">{t.loading}</p>}

      {data && (
        <>
          <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-3 dark:bg-brand-950">
            <Mascot pose={data.completed > 0 ? 'done' : 'rest'} height={96} />
            <p className="font-semibold text-brand-800 dark:text-brand-200">
              {data.completed > 0 ? t.mascot.reviewGood : t.mascot.reviewQuiet}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label={t.review.done} value={String(data.completed)} hint={t.defs.completed} />
            <Card label={t.review.overdue} value={String(data.overdueOpen)} />
            <Card
              label={t.review.rate}
              value={data.completionRate === null ? '—' : `${data.completionRate}%`}
              hint={`${data.scheduledDone}/${data.scheduled} ${t.review.scheduledOf} · ${t.defs.rate}`}
            />
            <Card label={t.review.focus} value={formatMinutes(data.focusMinutes)} />
          </div>

          <section aria-label={t.review.byCategory} className="space-y-2">
            <h3 className="font-semibold">{t.review.byCategory}</h3>
            <CategoryBars rows={data.byCategory} />
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.review.estimateNote}</p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section aria-label={t.review.completedList} className="space-y-2">
              <h3 className="font-semibold">{t.review.completedList}</h3>
              {list(data.completedTasks)}
            </section>
            <section aria-label={t.review.notDoneList} className="space-y-2">
              <h3 className="font-semibold">{t.review.notDoneList}</h3>
              {list(data.notDoneTasks)}
            </section>
          </div>

          <section
            aria-label={t.review.plan}
            className="space-y-2 rounded-lg border border-brand-200 p-3 dark:border-brand-900"
          >
            <h3 className="font-semibold">
              {t.review.planOf} {weekLabel(data.nextWeek.weekStart, today)}{' '}
              <span className="text-xs font-normal text-slate-600 dark:text-slate-300">
                ({dayLabel(data.nextWeek.weekStart)} – {dayLabel(data.nextWeek.weekEnd)})
              </span>
            </h3>
            <form onSubmit={add} className="flex flex-wrap gap-2">
              <label htmlFor="plan-title" className="sr-only">
                {t.review.planTitle}
              </label>
              <input
                id="plan-title"
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`${t.review.planTitle} ${weekLabel(data.nextWeek.weekStart, today)}`}
                className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
              <label htmlFor="plan-day" className="sr-only">
                {t.review.planDay}
              </label>
              <select
                id="plan-day"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                {nextDays.map((d) => (
                  <option key={d} value={d}>
                    {dayLabel(d)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busy || !title.trim()}
                className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {t.review.planAdd}
              </button>
            </form>
            {data.nextWeek.tasks.length === 0 ? (
              <p className="text-sm text-slate-500">{t.review.planEmpty}</p>
            ) : (
              list(data.nextWeek.tasks)
            )}
          </section>
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import CategoryBars from '../components/CategoryBars';
import { api, ApiClientError } from '../lib/api';
import { addDaysYmd, dayLabel, formatMinutes, mondayOf, todayYmd } from '../lib/dates';
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
  const [week, setWeek] = useState(addDaysYmd(thisMonday, -7)); // ค่าเริ่มต้น = สัปดาห์ที่แล้ว
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

  const list = (items: BriefTask[], withCheck: boolean) => (
    <ul className="space-y-1">
      {items.length === 0 && <li className="text-sm text-slate-500">{t.review.nothing}</li>}
      {items.map((x) => (
        <li
          key={x.id}
          className="flex items-start gap-2 rounded border border-slate-200 p-2 text-sm dark:border-slate-700"
        >
          {withCheck ? (
            <input
              type="checkbox"
              className="mt-0.5"
              aria-label={`${t.today.complete}: ${x.title}`}
              onChange={() => void api.completeTask(x.id).then(load)}
            />
          ) : (
            <span aria-hidden>✅</span>
          )}
          <span className="min-w-0 flex-1 break-words">{x.title}</span>
          {x.date && <span className="shrink-0 text-xs text-slate-500">{dayLabel(x.date)}</span>}
        </li>
      ))}
    </ul>
  );

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">{t.review.title}</h2>
        <button
          type="button"
          onClick={() => setWeek(addDaysYmd(week, -7))}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          ‹ {t.review.prev}
        </button>
        <span data-testid="week-range" className="text-sm font-medium">
          {data ? `${dayLabel(data.weekStart)} – ${dayLabel(data.weekEnd)}` : week}
        </span>
        <button
          type="button"
          disabled={week >= thisMonday}
          onClick={() => setWeek(addDaysYmd(week, 7))}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          {t.review.next} ›
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label={t.review.done} value={String(data.completed)} />
            <Card label={t.review.overdue} value={String(data.overdueOpen)} />
            <Card
              label={t.review.rate}
              value={data.completionRate === null ? '—' : `${data.completionRate}%`}
              hint={`${data.scheduledDone}/${data.scheduled} ${t.review.scheduledOf}`}
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
              {list(data.completedTasks, false)}
            </section>
            <section aria-label={t.review.notDoneList} className="space-y-2">
              <h3 className="font-semibold">{t.review.notDoneList}</h3>
              {list(data.notDoneTasks, true)}
            </section>
          </div>

          <section
            aria-label={t.review.plan}
            className="space-y-2 rounded-lg border border-indigo-200 p-3 dark:border-indigo-900"
          >
            <h3 className="font-semibold">
              {t.review.plan}{' '}
              <span className="text-xs font-normal text-slate-500">
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
                placeholder={t.review.planTitle}
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
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {t.review.planAdd}
              </button>
            </form>
            {data.nextWeek.tasks.length === 0 ? (
              <p className="text-sm text-slate-500">{t.review.planEmpty}</p>
            ) : (
              list(data.nextWeek.tasks, false)
            )}
          </section>
        </>
      )}
    </main>
  );
}

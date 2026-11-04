import { useEffect, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { dayLabel, formatMinutes } from '../lib/dates';
import EmptyState from '../components/EmptyState';
import { t } from '../lib/i18n';
import type { OverviewStats } from '../lib/types';

const RANGES = [7, 30, 90];

function DailyChart({ data }: { data: OverviewStats['daily'] }) {
  const W = 600;
  const H = 180;
  const pad = { l: 28, r: 4, t: 8, b: 20 };
  const max = Math.max(1, ...data.map((d) => Math.max(d.completed, d.scheduled)));
  const bw = (W - pad.l - pad.r) / data.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const total = data.reduce((n, d) => n + d.completed, 0);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${t.stats.daily}: รวม ${total} งาน`}
      className="w-full"
    >
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={y(max * f)}
            y2={y(max * f)}
            className="stroke-slate-200 dark:stroke-slate-700"
          />
          <text
            x={pad.l - 4}
            y={y(max * f) + 3}
            textAnchor="end"
            fontSize="9"
            className="fill-slate-500"
          >
            {Math.round(max * f)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = pad.l + i * bw;
        return (
          <g key={d.date}>
            <title>{`${dayLabel(d.date)}: เสร็จ ${d.completed} / กำหนด ${d.scheduled}`}</title>
            {d.scheduled > 0 && (
              <rect
                x={x + bw * 0.1}
                width={bw * 0.8}
                y={y(d.scheduled)}
                height={y(0) - y(d.scheduled)}
                fill="none"
                strokeWidth="1"
                className="stroke-slate-400"
              />
            )}
            <rect
              x={x + bw * 0.2}
              width={bw * 0.6}
              y={y(d.completed)}
              height={y(0) - y(d.completed)}
              className="fill-brand-600"
            />
          </g>
        );
      })}
      {data.map((d, i) =>
        i % Math.ceil(data.length / 6) === 0 ? (
          <text
            key={d.date}
            x={pad.l + i * bw + bw / 2}
            y={H - 5}
            textAnchor="middle"
            fontSize="9"
            className="fill-slate-500"
          >
            {d.date.slice(8)}/{d.date.slice(5, 7)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export default function StatsPage() {
  const [days, setDays] = useState(30);
  const [d, setD] = useState<OverviewStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api
      .overview(days)
      .then(setD)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : t.error.loadFailed));
  }, [days]);

  const share = d?.byCategory.filter((c) => c.focusMinutes + c.completed > 0) ?? [];
  const shareTotal = share.reduce((n, c) => n + (c.focusMinutes || c.completed), 0);
  const useFocus = (d?.focusMinutes ?? 0) > 0; // มีเวลาโฟกัสก็แบ่งตามเวลา ไม่งั้นแบ่งตามจำนวนงาน

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">{t.stats.title}</h2>
        <div
          role="group"
          aria-label={t.stats.range}
          className="flex overflow-hidden rounded border border-slate-300 dark:border-slate-600"
        >
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={days === r}
              onClick={() => setDays(r)}
              className={`px-3 py-1.5 text-sm ${days === r ? 'bg-brand-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              {r} {t.stats.days}
            </button>
          ))}
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
      {!d && !error && <p role="status">{t.loading}</p>}

      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              [
                t.stats.rate,
                d.completionRate === null ? '—' : `${d.completionRate}%`,
                `${d.scheduledDone}/${d.scheduled}`,
              ],
              [
                t.stats.completed,
                String(d.completedTotal),
                `${t.stats.thisWeek} ${d.totals.doneThisWeek}`,
              ],
              [t.stats.focus, formatMinutes(d.focusMinutes), `${t.stats.open} ${d.totals.open}`],
              [
                t.stats.streak,
                `${d.streak.current} ${t.stats.streakUnit}`,
                `${t.stats.best} ${d.streak.best} ${t.stats.streakUnit}`,
              ],
            ].map(([label, value, hint]) => (
              <div
                key={label}
                className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"
              >
                <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{hint}</div>
              </div>
            ))}
          </div>

          <section aria-label={t.stats.daily} className="space-y-2">
            <h3 className="font-semibold">{t.stats.daily}</h3>
            <DailyChart data={d.daily} />
            <details>
              <summary className="cursor-pointer text-xs text-brand-600 dark:text-brand-400">
                {t.stats.table}
              </summary>
              <table className="mt-2 w-full text-left text-xs">
                <thead>
                  <tr>
                    <th scope="col">{t.stats.date}</th>
                    <th scope="col">{t.stats.completed}</th>
                    <th scope="col">{t.stats.scheduled}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.daily
                    .filter((x) => x.completed || x.scheduled)
                    .map((x) => (
                      <tr key={x.date}>
                        <td>{dayLabel(x.date)}</td>
                        <td>{x.completed}</td>
                        <td>{x.scheduled}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </details>
          </section>

          <section aria-label={t.stats.share} className="space-y-2">
            <h3 className="font-semibold">{t.stats.share}</h3>
            {share.length === 0 ? (
              <EmptyState
                compact
                pose="plan"
                height={90}
                title={t.mascot.emptyStats}
                hint={t.mascot.emptyStatsHint}
              />
            ) : (
              <>
                <div className="flex h-4 overflow-hidden rounded" aria-hidden>
                  {share.map((c) => (
                    <div
                      key={c.categoryId ?? 'none'}
                      style={{
                        width: `${((useFocus ? c.focusMinutes : c.completed) / shareTotal) * 100}%`,
                        background: c.color,
                      }}
                    />
                  ))}
                </div>
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {share.map((c) => (
                    <li key={c.categoryId ?? 'none'} className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: c.color }}
                      />
                      <span className="flex-1">{c.name}</span>
                      <span className="text-xs text-slate-500">
                        {useFocus ? formatMinutes(c.focusMinutes) : `${c.completed} งาน`} (
                        {Math.round(((useFocus ? c.focusMinutes : c.completed) / shareTotal) * 100)}
                        %)
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}

import { formatMinutes } from '../lib/dates';
import { t } from '../lib/i18n';
import type { CategoryStat } from '../lib/types';

/** แท่งแนวนอนต่อประเภท: โฟกัส (ทึบ) และประมาณการ (เส้นขอบ) พร้อมตัวเลขกำกับ (ไม่พึ่งสีอย่างเดียว) */
export default function CategoryBars({ rows }: { rows: CategoryStat[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.focusMinutes, r.plannedMinutes ?? 0]));
  if (!rows.length) return <p className="text-sm text-slate-500">{t.review.nothing}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.categoryId ?? 'none'}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: r.color }}
              />
              {r.name}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {r.completed} งาน · {t.review.focusLegend.split(' ')[0]}{' '}
              {formatMinutes(r.focusMinutes)}
              {r.plannedMinutes !== undefined && ` · ประมาณการ ${formatMinutes(r.plannedMinutes)}`}
            </span>
          </div>
          <div className="space-y-1" aria-hidden>
            <div className="h-2 rounded bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded"
                style={{ width: `${(r.focusMinutes / max) * 100}%`, background: r.color }}
              />
            </div>
            {r.plannedMinutes !== undefined && (
              <div className="h-2 rounded bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded border-2"
                  style={{ width: `${(r.plannedMinutes / max) * 100}%`, borderColor: r.color }}
                />
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

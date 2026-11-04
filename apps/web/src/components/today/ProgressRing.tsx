import { fmtDuration } from '../../lib/planner';
import { t } from '../../lib/i18n';

/** วงแหวนความคืบหน้าของวัน: เสร็จ x / ทั้งหมด y + นาทีโฟกัสสะสม (ตัวเลขอยู่กลางวง ไม่พึ่งสีอย่างเดียว) */
export default function ProgressRing({
  done,
  total,
  focusMinutes,
}: {
  done: number;
  total: number;
  focusMinutes: number;
}) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  const text = t.cockpit.progressOf.replace('{d}', String(done)).replace('{t}', String(total));
  return (
    <section
      aria-label={t.cockpit.progress}
      className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label={text}>
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          strokeWidth="9"
          className="stroke-slate-200 dark:stroke-slate-700"
        />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform="rotate(-90 48 48)"
          className="stroke-brand-600 transition-[stroke-dashoffset] duration-500 dark:stroke-brand-400"
        />
        <text
          x="48"
          y="53"
          textAnchor="middle"
          fontSize="20"
          fontWeight="700"
          className="fill-slate-900 dark:fill-slate-100"
        >
          {done}/{total}
        </text>
      </svg>
      <div className="min-w-0 text-sm">
        <h2 className="font-semibold">{t.cockpit.progress}</h2>
        <p className="text-slate-600 dark:text-slate-300">{text}</p>
        <p className="mt-1 text-slate-600 dark:text-slate-300">
          {t.cockpit.focusToday}:{' '}
          <strong className="tabular-nums text-slate-900 dark:text-slate-100">
            {focusMinutes > 0 ? fmtDuration(focusMinutes) : '0 นาที'}
          </strong>
        </p>
      </div>
    </section>
  );
}

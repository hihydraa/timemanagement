import { fmtDuration, type DayLoad } from '../../lib/planner';
import { t } from '../../lib/i18n';

const COLOR: Record<DayLoad['status'], string> = {
  ok: 'var(--load-ok)',
  warn: 'var(--load-warn)',
  over: 'var(--load-over)',
  off: 'var(--border)',
};

/**
 * แถบภาระงานของวัน: เส้นสี (เขียว ≤70% / เหลือง ≤100% / แดง >100%) + ข้อความ "ใช้ไป 3 ชม. / ว่าง 7 ชม." และป้ายสถานะ
 * (ไม่พึ่งสีอย่างเดียว) — ใช้ซ้ำในหัวคอลัมน์สัปดาห์ของ Step 3
 */
export default function LoadBar({ load, showText = true }: { load: DayLoad; showText?: boolean }) {
  const pct = load.ratio === null ? 0 : Math.min(100, Math.round(load.ratio * 100));
  const label = `${t.cockpit.loadLabel}: ${t.cockpit.loadStatus[load.status]} — ${t.cockpit.loadOf} ${fmtDuration(load.planned)} จากเวลาว่าง ${fmtDuration(load.available)}`;
  return (
    <div title={t.cockpit.loadTip}>
      <div
        role="img"
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      >
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${load.status === 'over' ? 100 : pct}%`,
            background: COLOR[load.status],
          }}
        />
      </div>
      {showText && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-600 dark:text-slate-300">
          <span className="tabular-nums">
            {fmtDuration(load.planned)} / {fmtDuration(load.available)}
          </span>
          <span className="rounded-full bg-slate-100 px-1.5 font-medium dark:bg-slate-700">
            {t.cockpit.loadStatus[load.status]}
          </span>
          {load.appointmentMinutes > 0 && (
            <span>
              {t.cockpit.appointments} {fmtDuration(load.appointmentMinutes)}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

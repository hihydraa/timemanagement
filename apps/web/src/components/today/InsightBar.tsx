import type { DayLoad, Insight, Mood } from '../../lib/planner';
import { t } from '../../lib/i18n';
import Mascot, { type Pose } from '../Mascot';
import LoadBar from './LoadBar';

const POSE: Record<Mood, Pose> = { relaxed: 'morning', busy: 'deadline', happy: 'done' };

/** บรรทัด Insight ของ Dobby: สร้างจากข้อมูลจริงของวัน + แถบภาระงาน + ปุ่มลัดตามสถานการณ์ */
export default function InsightBar({
  insight,
  load,
  onAdd,
  onInbox,
  onTimeline,
}: {
  insight: Insight;
  load: DayLoad;
  onAdd: () => void;
  onInbox: () => void;
  onTimeline: () => void;
}) {
  const link =
    'rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium hover:bg-cool-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700';
  return (
    <section
      aria-label="Dobby"
      className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <Mascot pose={POSE[insight.mood]} height={84} />
      <div className="min-w-0 flex-1 space-y-2">
        <p
          role="status"
          data-testid="insight"
          data-kind={insight.kind}
          className="font-medium text-brand-900 dark:text-brand-100"
        >
          {insight.text}
        </p>
        {insight.kind !== 'empty' && <LoadBar load={load} />}
        <div className="flex flex-wrap gap-2">
          {(insight.kind === 'empty' || insight.kind === 'carry') && (
            <>
              <button type="button" onClick={onAdd} className={link}>
                + {t.cockpit.addTask}
              </button>
              <button type="button" onClick={onInbox} className={link}>
                {t.cockpit.openInbox}
              </button>
            </>
          )}
          {(insight.kind === 'over' || insight.kind === 'warn') && (
            <button type="button" onClick={onTimeline} className={link}>
              {t.cockpit.seeDay}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

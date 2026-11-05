import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { mondayOf } from '../../lib/dates';
import { t } from '../../lib/i18n';
import { bkYmd, fmtDuration, isReviewWindow } from '../../lib/planner';
import type { WeeklyStats } from '../../lib/types';
import Mascot from '../Mascot';

/** การ์ดสรุปสัปดาห์: โผล่ช่วงวันศุกร์ 15:00 → อาทิตย์ (ปิดได้ จำต่อสัปดาห์) และพาไปแท็บ "ฉัน → สรุปสัปดาห์" */
export default function ReviewCard({ now, onOpen }: { now: Date; onOpen: () => void }) {
  const inWindow = isReviewWindow(now);
  const week = mondayOf(bkYmd(now.toISOString()));
  const key = `dobby.reviewCard.${week}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const [data, setData] = useState<WeeklyStats | null>(null);
  useEffect(() => {
    if (!inWindow || dismissed) return;
    let alive = true;
    api
      .weekly(week)
      .then((d) => alive && setData(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [inWindow, dismissed, week]);

  if (!inWindow || dismissed || !data) return null;
  const body = t.today2.reviewCardBody
    .replace('{n}', String(data.completed))
    .replace('{f}', data.focusMinutes > 0 ? fmtDuration(data.focusMinutes) : '0 นาที');
  return (
    <section
      aria-label={t.today2.reviewCardTitle}
      className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-800 dark:bg-brand-950"
    >
      <Mascot pose={data.completed > 0 ? 'done' : 'rest'} height={64} />
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-brand-900 dark:text-brand-100">
          {t.today2.reviewCardTitle}
        </h2>
        <p className="text-sm text-slate-700 dark:text-slate-200">{body}</p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="rounded-full bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
      >
        {t.today2.reviewCardOpen}
      </button>
      <button
        type="button"
        aria-label={t.today2.reviewCardDismiss}
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(key, '1');
          } catch {
            /* ignore */
          }
        }}
        className="h-8 w-8 rounded-full hover:bg-brand-100 dark:hover:bg-brand-800"
      >
        ×
      </button>
    </section>
  );
}

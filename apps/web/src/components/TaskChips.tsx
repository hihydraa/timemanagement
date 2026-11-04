import { t } from '../lib/i18n';
import { timeLeft } from '../lib/time';
import type { Task } from '../lib/types';

type Tl = Pick<Task, 'dueAt' | 'dueDate' | 'status'>;

/** ชิปความสำคัญ: แสดงเฉพาะระดับ "สำคัญ" ขึ้นไป (ลดความรก) */
export function ImportanceChip({ level }: { level: number }) {
  if (level < 3) return null;
  return (
    <span
      title={`${t.form.importance}: ${t.importance[level]}`}
      className={`inline-flex items-center rounded-full px-1.5 text-[11px] font-medium leading-4 ${level >= 4 ? 'bg-brand-700 text-white' : 'bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100'}`}
    >
      {t.importance[level]}
    </span>
  );
}

/** ชิปนับถอยหลังถึงเดดไลน์ ("อีก 2 ชม." / "เลยมา 1 วัน" สีแดงเมื่อเลย) */
export function CountdownChip({ task }: { task: Tl }) {
  const tl = timeLeft(task);
  if (!tl) return null;
  return (
    <span
      title={t.chips.deadline}
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 text-[11px] font-medium leading-4 ${tl.overdue ? 'bg-red-700 text-white' : tl.urgent ? 'bg-amber-200 text-amber-950' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100'}`}
    >
      <span aria-hidden>⚑</span>
      {tl.text}
    </span>
  );
}

/** ความเร่งด่วนเป็นข้อความสำหรับ screen reader (สีแถบซ้ายเป็นภาพ) */
export function UrgencyText({ level }: { level: number }) {
  return (
    <span className="sr-only">
      {t.form.urgency}: {t.urgency[level]}
    </span>
  );
}

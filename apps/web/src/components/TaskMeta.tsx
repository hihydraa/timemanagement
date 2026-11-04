import { t } from '../lib/i18n';
import type { Task } from '../lib/types';

/** ความเร่งด่วน/สำคัญ/ทำซ้ำ/ไฟล์/checklist แบบข้อความ (ไม่พึ่งสีอย่างเดียว) */
export default function TaskMeta({ task }: { task: Task }) {
  return (
    <span className="text-xs text-slate-500 dark:text-slate-400">
      <span aria-label={`${t.form.urgency} ${task.urgency}`}>{'!'.repeat(task.urgency)}</span>{' '}
      <span aria-label={`${t.form.importance} ${task.importance}`}>
        {'★'.repeat(task.importance)}
      </span>
      {(task.recurrenceRule || task.recurrenceId) && (
        <span role="img" aria-label={t.series.badge}>
          {' '}
          🔁
        </span>
      )}
      {task.subtaskTotal > 0 && ` ☑ ${task.subtaskDone}/${task.subtaskTotal}`}
      {task.attachmentCount > 0 && ` 📎${task.attachmentCount}`}
      {task.tags.length > 0 && ` · ${task.tags.map((x) => `@${x}`).join(' ')}`}
    </span>
  );
}

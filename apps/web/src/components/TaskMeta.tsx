import { t } from '../lib/i18n';
import type { Task } from '../lib/types';
import { CountdownChip, ImportanceChip, UrgencyText } from './TaskChips';

/** ความสำคัญ/เดดไลน์เป็นชิป + ทำซ้ำ/ไฟล์/checklist (ความเร่งด่วนบอกด้วยแถบสีซ้ายของการ์ดและข้อความสำหรับ screen reader) */
export default function TaskMeta({ task }: { task: Task }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
      <UrgencyText level={task.urgency} />
      <ImportanceChip level={task.importance} />
      <CountdownChip task={task} />
      {(task.recurrenceRule || task.recurrenceId) && (
        <span role="img" aria-label={t.series.badge}>
          🔁
        </span>
      )}
      {task.subtaskTotal > 0 && <span>{`☑ ${task.subtaskDone}/${task.subtaskTotal}`}</span>}
      {task.attachmentCount > 0 && <span>{`📎${task.attachmentCount}`}</span>}
      {task.tags.length > 0 && <span>{task.tags.map((x) => `@${x}`).join(' ')}</span>}
    </span>
  );
}

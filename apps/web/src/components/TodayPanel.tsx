import { api } from '../lib/api';
import { t } from '../lib/i18n';
import { formatTimeRange } from '../lib/time';
import type { Task, TodayData } from '../lib/types';

interface Props {
  data: TodayData | null;
  onOpen: (task: Task) => void;
  onChanged: () => void;
}

function Group({
  title,
  tone,
  tasks,
  onOpen,
  onChanged,
}: {
  title: string;
  tone: string;
  tasks: Task[];
  onOpen: Props['onOpen'];
  onChanged: () => void;
}) {
  if (!tasks.length) return null;
  return (
    <div>
      <h3 className={`mb-1 text-xs font-semibold ${tone}`}>
        {title} ({tasks.length})
      </h3>
      <ul className="space-y-1">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex items-start gap-2 rounded border border-slate-200 p-2 dark:border-slate-700"
          >
            <input
              type="checkbox"
              aria-label={`${t.today.complete}: ${task.title}`}
              className="mt-1"
              onChange={() =>
                api
                  .completeTask(task.id)
                  .then(onChanged)
                  .catch(() => undefined)
              }
            />
            <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">{task.title}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {formatTimeRange(task) || task.dueDate} · {'!'.repeat(task.urgency)}{' '}
                {'★'.repeat(task.importance)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TodayPanel({ data, onOpen, onChanged }: Props) {
  const empty = data && !data.overdue.length && !data.dueToday.length && !data.today.length;
  return (
    <section aria-label={t.today.title} className="space-y-3">
      <h2 className="text-base font-semibold">{t.today.title}</h2>
      {!data && <p className="text-sm text-slate-500">{t.loading}</p>}
      {empty && <p className="text-sm text-slate-500">{t.today.empty}</p>}
      {data && (
        <>
          <Group
            title={t.today.overdue}
            tone="text-red-600 dark:text-red-400"
            tasks={data.overdue}
            onOpen={onOpen}
            onChanged={onChanged}
          />
          <Group
            title={t.today.dueToday}
            tone="text-orange-600 dark:text-orange-400"
            tasks={data.dueToday}
            onOpen={onOpen}
            onChanged={onChanged}
          />
          <Group
            title={t.today.todayTasks}
            tone="text-slate-600 dark:text-slate-300"
            tasks={data.today}
            onOpen={onOpen}
            onChanged={onChanged}
          />
        </>
      )}
    </section>
  );
}

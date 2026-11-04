import { Draggable } from '@fullcalendar/interaction';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { t } from '../lib/i18n';
import type { Task } from '../lib/types';

/** รายการ Inbox ที่ลากลงช่องเวลาในปฏิทินได้ (time blocking) — บนมือถือใช้หน้า Inbox แทน */
export default function InboxDock({
  reloadKey,
  onOpen,
}: {
  reloadKey: number;
  onOpen: (t: Task) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    api
      .inbox()
      .then((r) => setTasks(r.slice(0, 8)))
      .catch(() => undefined);
  }, [reloadKey]);

  const hasItems = tasks.length > 0;

  // <ul> จะถูก mount ก็ต่อเมื่อมีรายการ จึงต้องสร้าง Draggable ใหม่เมื่อ hasItems เปลี่ยน
  useEffect(() => {
    if (!hasItems || !ref.current) return;
    const d = new Draggable(ref.current, {
      itemSelector: '[data-inbox-id]',
      // create:false = ไม่สร้าง event เอง เราจัดการผ่าน callback drop แล้วบันทึกลงงานเดิม
      eventData: (el) => ({ title: el.dataset.title ?? '', create: false }),
    });
    return () => d.destroy();
  }, [hasItems]);

  if (tasks.length === 0) return null;
  return (
    <section aria-label={t.inbox.dockTitle} className="mt-4 space-y-2">
      <h2 className="text-base font-semibold">{t.inbox.dockTitle}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t.inbox.dockHint}</p>
      <ul ref={ref} className="space-y-1">
        {tasks.map((x) => (
          <li
            key={x.id}
            data-inbox-id={x.id}
            data-title={x.title}
            data-estimate={x.estimateMinutes ?? ''}
            className="flex items-center gap-2 rounded border border-dashed border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          >
            {/* ที่จับลาก: แยกจากปุ่มเปิดงาน (ปุ่มดักเหตุการณ์ลากของเบราว์เซอร์) */}
            <span
              aria-hidden
              title={t.inbox.dockHint}
              data-drag-handle
              className="cursor-grab select-none px-1 text-slate-400 active:cursor-grabbing"
            >
              ⠿
            </span>
            <button
              type="button"
              onClick={() => onOpen(x)}
              className="min-w-0 flex-1 truncate text-left"
            >
              {x.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

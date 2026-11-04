import { Draggable } from '@fullcalendar/interaction';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { addDaysYmd, todayYmd } from '../../lib/dates';
import { URGENCY_COLORS } from '../../lib/colors';
import { t } from '../../lib/i18n';
import { fmtDuration } from '../../lib/planner';
import type { Task } from '../../lib/types';
import Mascot from '../Mascot';
import Popover from '../Popover';
import { CountdownChip, ImportanceChip, UrgencyText } from '../TaskChips';
import { DND_TYPE, type DropSource } from './WeekCards';

/**
 * ถาดงาน: งานที่ยังไม่ได้จัดเวลา แบ่งเป็น "เดดไลน์ใกล้/มีวันแล้ว" กับ "ยังไม่มีวัน"
 * วางได้ 3 ทาง: ลากไปวางที่คอลัมน์วัน (การ์ด) / ช่องเวลา (ตารางเวลา, ผ่าน FullCalendar Draggable) / กด "จัดลง…" (ใช้ได้บนมือถือ)
 */
export default function TaskTray({
  reloadKey,
  dragMode,
  variant,
  open = true,
  onClose,
  onOpen,
  onSchedule,
  onLoaded,
}: {
  reloadKey: number;
  /** cards = HTML5 drag ไปคอลัมน์วัน, fc = FullCalendar Draggable ไปช่องเวลา, none = ไม่ลาก */
  dragMode: 'cards' | 'fc' | 'none';
  variant: 'side' | 'sheet';
  open?: boolean;
  onClose?: () => void;
  onOpen: (t: Task) => void;
  onSchedule: (task: Task, ymd: string) => void;
  onLoaded?: (tasks: Task[]) => void;
}) {
  const [dated, setDated] = useState<Task[]>([]);
  const [inbox, setInbox] = useState<Task[]>([]);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  useEffect(() => {
    let alive = true;
    api
      .tray()
      .then((r) => {
        if (!alive) return;
        setDated(r.dated);
        setInbox(r.inbox);
        setError(false);
        onLoadedRef.current?.([...r.dated, ...r.inbox]);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const count = dated.length + inbox.length;
  useEffect(() => {
    if (variant === 'sheet' && open) {
      const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [variant, open, onClose]);

  // ลากลงช่องเวลาของ FullCalendar (มุมมองตารางเวลา) ต้องสร้าง Draggable บน container ที่ render แล้ว
  useEffect(() => {
    if (dragMode !== 'fc' || !ref.current || count === 0) return;
    const d = new Draggable(ref.current, {
      itemSelector: '[data-inbox-id]',
      eventData: (el) => ({ title: el.dataset.title ?? '', create: false }),
    });
    return () => d.destroy();
  }, [dragMode, count, open]);

  if (variant === 'sheet' && !open) return null;

  const row = (x: Task) => (
    <li
      key={x.id}
      data-inbox-id={x.id}
      data-title={x.title}
      data-estimate={x.estimateMinutes ?? ''}
      draggable={dragMode === 'cards'}
      onDragStart={(e) => {
        e.dataTransfer.setData(
          DND_TYPE,
          JSON.stringify({ id: x.id, source: 'tray' satisfies DropSource }),
        );
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="rounded-lg border border-l-4 border-slate-200 bg-white p-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800"
      style={{ borderLeftColor: URGENCY_COLORS[x.urgency] }}
    >
      <div className="flex items-start gap-1.5">
        {dragMode !== 'none' && (
          <span
            aria-hidden
            title={t.tray.hint}
            className="cursor-grab select-none pt-0.5 text-slate-400 active:cursor-grabbing"
          >
            ⠿
          </span>
        )}
        <button type="button" onClick={() => onOpen(x)} className="min-w-0 flex-1 text-left">
          <UrgencyText level={x.urgency} />
          <span className="line-clamp-2 break-words font-medium">{x.title}</span>
          <span className="flex flex-wrap items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            <span>{fmtDuration(x.estimateMinutes ?? 30)}</span>
            <ImportanceChip level={x.importance} />
            <CountdownChip task={x} />
          </span>
        </button>
      </div>
      <div className="mt-1.5 flex justify-end">
        <Popover label={t.tray.place} align="right" width="w-56">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onSchedule(x, todayYmd())}
              className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              {t.tray.today}
            </button>
            <button
              type="button"
              onClick={() => onSchedule(x, addDaysYmd(todayYmd(), 1))}
              className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              {t.tray.tomorrow}
            </button>
            <label className="block text-xs">
              {t.tray.pickDay}
              <input
                type="date"
                aria-label={`${t.tray.pickDay}: ${x.title}`}
                onChange={(e) => e.target.value && onSchedule(x, e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
              />
            </label>
          </div>
        </Popover>
      </div>
    </li>
  );

  const body = (
    <div ref={ref} className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {t.error.loadFailed}
        </p>
      )}
      {!error && count === 0 && (
        <div className="flex items-center gap-2 py-2 text-sm text-slate-600 dark:text-slate-300">
          <Mascot pose="done" height={56} />
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{t.tray.empty}</p>
            <p>{t.tray.emptyHint}</p>
          </div>
        </div>
      )}
      {dated.length > 0 && (
        <section aria-label={t.tray.dated}>
          <h3 className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t.tray.dated} ({dated.length})
          </h3>
          <ul className="space-y-1.5">{dated.map(row)}</ul>
        </section>
      )}
      {inbox.length > 0 && (
        <section aria-label={t.tray.inbox}>
          <h3 className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t.tray.inbox} ({inbox.length})
          </h3>
          <ul className="space-y-1.5">{inbox.map(row)}</ul>
        </section>
      )}
    </div>
  );

  if (variant === 'sheet') {
    return (
      <div className="fixed inset-0 z-40 lg:hidden">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
        <div
          role="dialog"
          aria-label={t.tray.title}
          aria-modal="true"
          className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-slate-50 p-4 shadow-lg dark:bg-slate-900"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">
              {t.tray.title} ({count})
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-300 px-3 py-1 text-sm dark:border-slate-600"
            >
              {t.tray.close}
            </button>
          </div>
          <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{t.tray.hintTouch}</p>
          {body}
        </div>
      </div>
    );
  }
  return (
    <aside aria-label={t.tray.title} className="space-y-2">
      <h2 className="text-base font-semibold">
        {t.tray.title}{' '}
        {count > 0 && (
          <span className="text-sm font-normal text-slate-600 dark:text-slate-300">({count})</span>
        )}
      </h2>
      <p className="text-xs text-slate-600 dark:text-slate-300">
        {dragMode === 'none' ? t.tray.hintTouch : t.tray.hint}
      </p>
      {body}
    </aside>
  );
}

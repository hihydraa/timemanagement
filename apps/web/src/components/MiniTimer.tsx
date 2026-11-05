import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';

const RUN_KEY = 'dobby.focus.run';
interface Run {
  phase: 'focus' | 'break';
  endsAt: number;
}

const read = (): Run | null => {
  try {
    const v = JSON.parse(localStorage.getItem(RUN_KEY) ?? 'null') as Run | null;
    return v && typeof v.endsAt === 'number' ? v : null;
  } catch {
    return null;
  }
};
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * มินิไทเมอร์ลอย: แสดงเมื่อมีรอบโฟกัสกำลังทำงานอยู่ขณะที่อยู่หน้าอื่น (หน้าโฟกัสเต็มไม่อยู่ในเมนู)
 * อ่านสถานะชุดเดียวกับหน้าโฟกัส (localStorage) — การบันทึกเซสชันยังทำที่หน้าโฟกัสเหมือนเดิม
 */
export default function MiniTimer({ onOpen }: { onOpen: () => void }) {
  const [run, setRun] = useState<Run | null>(read);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      setRun(read());
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!run) return null;
  const left = run.endsAt - now;
  const done = left <= 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed bottom-28 right-3 z-30 flex items-center gap-2 rounded-full bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-brand-800 md:bottom-6 md:right-6"
      aria-label={`${t.mini.label}: ${done ? t.mini.done : mmss(left)}`}
    >
      <span aria-hidden>{run.phase === 'break' ? '☕' : '⏱'}</span>
      <span className="tabular-nums">{done ? t.mini.done : mmss(left)}</span>
      <span className="hidden text-xs opacity-80 sm:inline">{t.mini.open}</span>
    </button>
  );
}

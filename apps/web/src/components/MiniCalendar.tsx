import { useMemo, useState } from 'react';
import { todayYmd } from '../lib/time';

const DOW = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** ปฏิทินย่อรายเดือน (สัปดาห์เริ่มวันจันทร์): คลิกวันเพื่อเลื่อนปฏิทินหลักไปวันนั้น */
export default function MiniCalendar({
  selected,
  onPick,
}: {
  /** วันที่ปฏิทินหลักกำลังแสดงอยู่ (YYYY-MM-DD) ใช้ไฮไลต์สัปดาห์นั้น */
  selected: string;
  onPick: (ymd: string) => void;
}) {
  const [month, setMonth] = useState(() => todayYmd().slice(0, 7)); // YYYY-MM
  const today = todayYmd();
  const first = new Date(`${month}-01T00:00:00Z`);
  const title = first.toLocaleDateString('th-TH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const cells = useMemo(() => {
    const start = new Date(first);
    start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      return d;
    });
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps
  const shift = (n: number) => {
    const d = new Date(first);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(ymd(d).slice(0, 7));
  };
  const selWeek = useMemo(() => {
    const d = new Date(`${selected}T00:00:00Z`);
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return new Set(Array.from({ length: 7 }, (_, i) => ymd(new Date(mon.getTime() + i * 864e5))));
  }, [selected]);

  return (
    <section
      aria-label="ปฏิทินย่อ"
      className="rounded-xl border border-slate-200 bg-white p-2 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          aria-label="เดือนก่อนหน้า"
          onClick={() => shift(-1)}
          className="h-7 w-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          ‹
        </button>
        <span className="font-semibold" aria-live="polite">
          {title}
        </span>
        <button
          type="button"
          aria-label="เดือนถัดไป"
          onClick={() => shift(1)}
          className="h-7 w-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {DOW.map((d) => (
          <span key={d} className="py-0.5 text-[11px] text-slate-500 dark:text-slate-300">
            {d}
          </span>
        ))}
        {cells.map((d) => {
          const key = ymd(d);
          const inMonth = key.slice(0, 7) === month;
          const isToday = key === today;
          return (
            <button
              key={key}
              type="button"
              aria-label={d.toLocaleDateString('th-TH', {
                dateStyle: 'full',
                timeZone: 'UTC',
              })}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => onPick(key)}
              className={`h-7 rounded-md tabular-nums ${isToday ? 'bg-brand-600 font-semibold text-white' : selWeek.has(key) ? 'bg-brand-100 dark:bg-brand-800' : 'hover:bg-slate-100 dark:hover:bg-slate-700'} ${inMonth ? '' : 'text-slate-400'}`}
            >
              {d.getUTCDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}

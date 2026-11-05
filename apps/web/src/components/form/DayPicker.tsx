import { useState } from 'react';
import { dayLabel, nextMonday, todayYmd, tomorrow } from '../../lib/dates';
import { t } from '../../lib/i18n';

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700'}`;

/**
 * เลือกวันแบบเร็ว: วันนี้ / พรุ่งนี้ / สัปดาห์หน้า / เลือกวัน… (ช่องวันที่ของเบราว์เซอร์ใช้เมื่อจำเป็นเท่านั้น)
 * allowNone = มีตัวเลือก "ไม่ระบุวัน" (ไปที่ยังไม่จัดเวลา)
 */
export default function DayPicker({
  label,
  value,
  onChange,
  allowNone = false,
  min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowNone?: boolean;
  min?: string;
}) {
  const quick = [
    { v: todayYmd(), text: t.form2.today },
    { v: tomorrow(), text: t.form2.tomorrow },
    { v: nextMonday(), text: t.form2.nextWeek },
  ];
  const isQuick = quick.some((q) => q.v === value);
  const [custom, setCustom] = useState(!!value && !isQuick);
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
      </legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {quick.map((q) => (
          <button
            key={q.text}
            type="button"
            aria-pressed={value === q.v}
            onClick={() => {
              setCustom(false);
              onChange(q.v);
            }}
            className={chip(value === q.v)}
          >
            {q.text}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom || (!!value && !isQuick)}
          onClick={() => setCustom(true)}
          className={chip(custom || (!!value && !isQuick))}
        >
          {t.form2.pickDay}
        </button>
        {allowNone && (
          <button
            type="button"
            aria-pressed={!value}
            onClick={() => {
              setCustom(false);
              onChange('');
            }}
            className={chip(!value)}
          >
            {t.form2.noDay}
          </button>
        )}
      </div>
      {(custom || (!!value && !isQuick)) && (
        <input
          type="date"
          aria-label={`${label}: ${t.form2.pickDay}`}
          value={value}
          min={min}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
        />
      )}
      {value && (
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{dayLabel(value)}</p>
      )}
    </fieldset>
  );
}

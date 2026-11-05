import { useId } from 'react';
import { t } from '../../lib/i18n';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const sel =
  'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm tabular-nums dark:border-slate-600 dark:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500';

/**
 * ช่องเลือกเวลาแบบ 24 ชม. (ชั่วโมง 00–23 + นาที ทีละ 5): ไม่ขึ้นกับภาษา/รูปแบบ AM-PM ของเบราว์เซอร์
 * ค่า '' = ยังไม่เลือก; รับค่านาทีที่ไม่ใช่ทวีคูณของ 5 ได้ (เช่นงานเดิม 16:37)
 */
export default function TimeField24({
  label,
  value,
  onChange,
  emptyLabel = '--',
  clearable = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  emptyLabel?: string;
  clearable?: boolean;
}) {
  const id = useId();
  const [h, m] = value ? value.split(':') : ['', ''];
  const minutes = m && !MINUTES.includes(m) ? [...MINUTES, m].sort() : MINUTES;
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
      </legend>
      <div className="flex items-center gap-1.5">
        <label htmlFor={`${id}-h`} className="sr-only">
          {label} — {t.form2.hour}
        </label>
        <select
          id={`${id}-h`}
          className={sel}
          value={h ?? ''}
          onChange={(e) =>
            e.target.value ? onChange(`${e.target.value}:${m || '00'}`) : onChange('')
          }
        >
          {clearable && <option value="">{emptyLabel}</option>}
          {HOURS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <span aria-hidden>:</span>
        <label htmlFor={`${id}-m`} className="sr-only">
          {label} — {t.form2.minute}
        </label>
        <select
          id={`${id}-m`}
          className={sel}
          value={m ?? ''}
          disabled={!h}
          onChange={(e) => h && onChange(`${h}:${e.target.value}`)}
        >
          {!h && <option value="">{emptyLabel}</option>}
          {minutes.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-600 dark:text-slate-300">{t.form2.hourUnit}</span>
      </div>
    </fieldset>
  );
}

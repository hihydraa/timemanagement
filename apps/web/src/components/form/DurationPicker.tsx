import { DURATION_CHIPS } from '../../lib/taskForm';
import { t } from '../../lib/i18n';

const label = (m: number) =>
  m < 60 ? `${m} ${t.form2.minShort}` : `${m / 60} ${t.form2.hourShort}`;
const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700'}`;

/** ระยะเวลา/เวลาประมาณ: 15 น. / 30 น. / 1 ชม. / 2 ชม. + กรอกเอง (นาที) */
export default function DurationPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (m: number) => void;
}) {
  const preset = (DURATION_CHIPS as readonly number[]).includes(value);
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">
        {t.form2.duration}
      </legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {DURATION_CHIPS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={value === m}
            onClick={() => onChange(m)}
            className={chip(value === m)}
          >
            {label(m)}
          </button>
        ))}
        <label className="flex items-center gap-1 text-sm">
          <span className="sr-only">{t.form2.durationCustom}</span>
          <input
            type="number"
            min={1}
            max={1440}
            inputMode="numeric"
            value={preset ? '' : value}
            placeholder={t.form2.other}
            onChange={(e) => e.target.value && onChange(Number(e.target.value))}
            className={`w-20 rounded-lg border px-2 py-1.5 text-sm ${preset ? 'border-slate-300 dark:border-slate-600' : 'border-brand-700'} bg-white dark:bg-slate-800`}
          />
          <span className="text-xs text-slate-600 dark:text-slate-300">{t.form2.minShort}</span>
        </label>
      </div>
    </fieldset>
  );
}

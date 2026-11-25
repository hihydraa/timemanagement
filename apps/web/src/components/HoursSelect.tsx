import { t } from '../lib/i18n';

const OPTIONS = [1, 2, 3, 4, 5, 6, 7];

/** เลือกระยะเวลาที่หยุดในวัน: '' = เต็มวัน, ตัวเลข = หยุดกี่ชั่วโมง (4 = ครึ่งวัน) */
export default function HoursSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  /** ช่วงหลายวันระบุชั่วโมงไม่ได้ */
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className="block text-xs">
      {t.daysOff.duration}
      <select
        className={className}
        value={disabled ? '' : value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t.daysOff.fullDay}</option>
        {OPTIONS.map((h) => (
          <option key={h} value={String(h)}>
            {h === 4 ? t.daysOff.halfDay : t.daysOff.hours.replace('{h}', String(h))}
          </option>
        ))}
      </select>
      {disabled && (
        <span className="text-slate-600 dark:text-slate-300">{t.daysOff.hoursSingleOnly}</span>
      )}
    </label>
  );
}

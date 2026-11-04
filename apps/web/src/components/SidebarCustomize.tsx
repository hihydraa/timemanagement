import { t } from '../lib/i18n';
import { SIDEBAR_ALL, SIDEBAR_DEFAULT, sortSections } from '../lib/sidebar';
import type { SidebarSection } from '../lib/types';
import Popover from './Popover';

/** ปุ่ม "ปรับแต่ง" (ปิดเป็นค่าเริ่มต้น): เลือกส่วนที่แสดงในแถบด้านข้าง บันทึกต่อบัญชี */
export default function SidebarCustomize({
  value,
  onChange,
}: {
  value: SidebarSection[];
  onChange: (s: SidebarSection[]) => void;
}) {
  const toggle = (s: SidebarSection) =>
    onChange(sortSections(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]));
  return (
    <Popover label={t.filter.customize} icon="⚙">
      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs font-semibold">{t.filter.customizeTitle}</legend>
        {SIDEBAR_ALL.map((s) => (
          <label key={s} className="flex cursor-pointer items-center gap-2 py-0.5">
            <input
              type="checkbox"
              checked={value.includes(s)}
              onChange={() => toggle(s)}
              className="h-4 w-4 accent-brand-600"
            />
            {t.filter.sections[s]}
          </label>
        ))}
        <p className="pt-1 text-xs text-slate-600 dark:text-slate-300">{t.filter.customizeHint}</p>
        <button
          type="button"
          onClick={() => onChange(SIDEBAR_DEFAULT)}
          className="text-xs text-brand-700 underline dark:text-brand-300"
        >
          {t.filter.reset}
        </button>
      </fieldset>
    </Popover>
  );
}

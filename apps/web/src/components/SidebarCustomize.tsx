import { useState } from 'react';
import { t } from '../lib/i18n';
import { SIDEBAR_ALL, SIDEBAR_DEFAULT, sortSections } from '../lib/sidebar';
import type { SidebarSection } from '../lib/types';

/** ปุ่มปรับแต่งแถบด้านข้าง: เลือกส่วนที่แสดง (บันทึกต่อบัญชี) */
export default function SidebarCustomize({
  value,
  onChange,
}: {
  value: SidebarSection[];
  onChange: (s: SidebarSection[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (s: SidebarSection) =>
    onChange(sortSections(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]));
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="sidebar-customize"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <span aria-hidden>⚙</span> {t.filter.customize}
      </button>
      {open && (
        <fieldset
          id="sidebar-customize"
          className="mt-2 space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-soft dark:border-slate-700 dark:bg-slate-800"
        >
          <legend className="px-1 text-xs font-semibold">{t.filter.customizeTitle}</legend>
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
          <p className="pt-1 text-xs text-slate-600 dark:text-slate-400">
            {t.filter.customizeHint}
          </p>
          <button
            type="button"
            onClick={() => onChange(SIDEBAR_DEFAULT)}
            className="text-xs text-brand-700 underline dark:text-brand-300"
          >
            {t.filter.reset}
          </button>
        </fieldset>
      )}
    </div>
  );
}

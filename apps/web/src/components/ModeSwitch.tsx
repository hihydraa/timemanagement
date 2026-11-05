import { useApp, type UiMode } from '../lib/appContext';
import { t } from '../lib/i18n';

/** สลับโหมดง่าย/เต็ม — มีผลทันทีโดยไม่รีโหลด (ข้อมูลไม่เปลี่ยน แค่ซ่อน/แสดงส่วนที่ละเอียด) */
export default function ModeSwitch() {
  const { uiMode, setUiMode } = useApp();
  const opts: { id: UiMode; label: string; hint: string }[] = [
    { id: 'simple', label: t.mode.simple, hint: t.mode.simpleHint },
    { id: 'full', label: t.mode.full, hint: t.mode.fullHint },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-semibold">{t.mode.title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {opts.map((o) => (
          <label
            key={o.id}
            className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${uiMode === o.id ? 'border-brand-600 bg-brand-50 dark:bg-brand-950' : 'border-slate-300 dark:border-slate-600'}`}
          >
            <input
              type="radio"
              name="ui-mode"
              value={o.id}
              checked={uiMode === o.id}
              onChange={() => setUiMode(o.id)}
              className="mt-1 h-4 w-4 accent-brand-600"
            />
            <span>
              <strong className="block">{o.label}</strong>
              <span className="text-xs text-slate-600 dark:text-slate-300">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

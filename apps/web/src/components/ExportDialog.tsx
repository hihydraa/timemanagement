import { useEffect, useRef } from 'react';
import { t } from '../lib/i18n';

const FORMATS = [
  { f: 'json', label: t.export.json },
  { f: 'csv', label: t.export.csv },
  { f: 'ics', label: t.export.ics },
] as const;

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-title"
    >
      <div className="w-full max-w-sm space-y-3 rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 id="export-title" className="text-lg font-semibold">
            {t.export.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t.form.close}
            className="rounded px-2 py-1 text-xl leading-none hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.export.intro}</p>
        <ul className="space-y-2">
          {FORMATS.map(({ f, label }) => (
            <li key={f}>
              {/* ดาวน์โหลดผ่าน GET ที่ตรวจ session (cookie) — ไม่มี URL สาธารณะ */}
              <a
                href={`/api/export?format=${f}`}
                download
                className="block rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

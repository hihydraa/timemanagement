import { useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { todayYmd } from '../lib/dates';
import { t } from '../lib/i18n';
import { planImport, type SheetPlan } from '../lib/importMap';
import { readXlsx } from '../lib/xlsx';
import { notifyTasksChanged } from '../lib/undo';

const MAX = 500;

/** นำเข้างานจากไฟล์ Excel (แม่แบบ Task Management เดิม): อ่านในเบราว์เซอร์ → เลือกชีต → นำเข้า */
export default function ImportDialog({ onClose }: { onClose: () => void }) {
  const [plans, setPlans] = useState<SheetPlan[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ imported: number; skipped: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const m = t.import;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError('');
    setDone(null);
    try {
      const p = planImport(await readXlsx(await f.arrayBuffer()), todayYmd());
      if (!p.length) throw new Error(m.noTable);
      setPlans(p);
      setPicked(new Set(p.filter((x) => !x.aggregate).map((x) => x.name)));
    } catch (e) {
      setPlans(null);
      setError(e instanceof Error ? e.message : t.error.generic);
    }
  }

  const chosen = (plans ?? []).filter((p) => picked.has(p.name));
  const total = chosen.reduce((n, p) => n + p.tasks.length, 0);

  async function run() {
    setError('');
    setBusy(true);
    try {
      const all = chosen.flatMap((p) => p.tasks);
      let imported = 0;
      let skipped = 0;
      for (let i = 0; i < all.length; i += MAX) {
        const r = await api.importTasks(all.slice(i, i + MAX));
        imported += r.imported;
        skipped += r.skipped;
      }
      setDone({ imported, skipped });
      notifyTasksChanged();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-title"
    >
      <div className="max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 id="import-title" className="text-lg font-semibold">
            {m.title}
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
        <p className="text-sm text-slate-600 dark:text-slate-300">{m.intro}</p>

        <div>
          <label htmlFor="import-file" className="mb-1 block text-xs font-medium">
            {m.pick}
          </label>
          <input
            id="import-file"
            type="file"
            accept=".xlsx"
            onChange={(e) => void onFile(e.target.files?.[0])}
            className="block w-full text-sm"
          />
        </div>

        {plans && !done && (
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-semibold">{m.sheets}</legend>
            {plans.map((p) => (
              <label key={p.name} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-brand-600"
                  checked={picked.has(p.name)}
                  onChange={(e) => {
                    const n = new Set(picked);
                    if (e.target.checked) n.add(p.name);
                    else n.delete(p.name);
                    setPicked(n);
                  }}
                />
                <span>
                  <strong>{p.name}</strong> · {p.tasks.length} {m.tasks}
                  {p.aggregate && (
                    <span className="block text-xs text-amber-700 dark:text-amber-300">
                      {m.aggregateHint}
                    </span>
                  )}
                </span>
              </label>
            ))}
            <p className="text-xs text-slate-600 dark:text-slate-300">{m.rules}</p>
          </fieldset>
        )}

        {error && (
          <p
            role="alert"
            className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        )}
        {done && (
          <p
            role="status"
            className="rounded bg-green-50 p-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-200"
          >
            {m.result.replace('{n}', String(done.imported)).replace('{s}', String(done.skipped))}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm dark:border-slate-600"
          >
            {done ? m.close : t.form.cancel}
          </button>
          {plans && !done && (
            <button
              type="button"
              disabled={busy || total === 0}
              onClick={() => void run()}
              className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? m.working : m.go.replace('{n}', String(total))}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

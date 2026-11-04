import { useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { useApp } from '../lib/appContext';
import { t } from '../lib/i18n';

/** โซนอันตราย: ลบบัญชีและข้อมูลทั้งหมด (ต้องพิมพ์อีเมลยืนยัน) */
export default function DeleteAccount() {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const match = typed.trim().toLowerCase() === user.email.toLowerCase();

  async function go() {
    if (!match || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteAccount(typed.trim());
      window.location.replace('/'); // กลับหน้า login (session และ cache ถูกล้างแล้ว)
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
      setBusy(false);
    }
  }

  return (
    <section
      aria-label={t.account.title}
      className="mt-6 rounded-xl border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950"
    >
      <h3 className="font-semibold text-red-800 dark:text-red-200">{t.account.title}</h3>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 rounded-full border border-red-700 px-3 py-1.5 text-red-800 hover:bg-red-100 dark:border-red-400 dark:text-red-200 dark:hover:bg-red-900"
        >
          {t.account.open}
        </button>
      ) : (
        <div className="mt-2 space-y-2 text-red-900 dark:text-red-100">
          <p>{t.account.intro}</p>
          <ul className="list-disc pl-5">
            {t.account.items.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="text-xs">{t.account.keep}</p>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">
              {t.account.typeEmail} ({user.email})
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="w-full rounded border border-red-300 bg-white px-2 py-1.5 text-slate-900 dark:border-red-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          {error && (
            <p role="alert" className="text-red-800 dark:text-red-200">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={!match || busy}
            onClick={() => void go()}
            className="rounded-full bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            {busy ? t.account.deleting : t.account.confirm}
          </button>
        </div>
      )}
    </section>
  );
}

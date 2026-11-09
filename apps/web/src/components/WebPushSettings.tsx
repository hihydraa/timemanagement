import { useEffect, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { t } from '../lib/i18n';
import { currentPushState, disablePush, enablePush, type PushState } from '../lib/webPush';

/** แจ้งเตือนในเว็บ/เบราว์เซอร์ (Web Push): สมัคร/ยกเลิกต่ออุปกรณ์ — ไม่กินโควตา LINE */
export default function WebPushSettings() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const w = t.webpush;

  useEffect(() => {
    void currentPushState()
      .then(setState)
      .catch(() => setState('unsupported'));
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof ApiClientError ? e.message : w.failed);
    } finally {
      setBusy(false);
    }
  }
  const btn =
    'rounded-full border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800';

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <h3 className="text-sm font-semibold">{w.title}</h3>
      <p className="text-xs text-slate-600 dark:text-slate-300">{w.hint}</p>
      {state === null && <p role="status">{t.loading}</p>}
      {state === 'unsupported' && (
        <p className="text-sm text-amber-700 dark:text-amber-300">{w.unsupported}</p>
      )}
      {state === 'unconfigured' && (
        <p className="text-sm text-amber-700 dark:text-amber-300">{w.unconfigured}</p>
      )}
      {state === 'blocked' && (
        <p className="text-sm text-amber-700 dark:text-amber-300">{w.blocked}</p>
      )}
      {state === 'off' && (
        <button
          type="button"
          disabled={busy}
          className={`${btn} bg-brand-600 text-white hover:bg-brand-700 dark:hover:bg-brand-700 border-transparent`}
          onClick={() => void run(async () => setState(await enablePush()))}
        >
          {w.enable}
        </button>
      )}
      {state === 'on' && (
        <div className="flex flex-wrap items-center gap-2">
          <span role="status" className="text-sm text-green-700 dark:text-green-400">
            ✓ {w.on}
          </span>
          <button
            type="button"
            disabled={busy}
            className={btn}
            onClick={() =>
              void run(async () => {
                const r = await api.pushTest();
                setMsg(r.ok > 0 ? w.testSent : w.testFailed);
              })
            }
          >
            {w.test}
          </button>
          <button
            type="button"
            disabled={busy}
            className={btn}
            onClick={() =>
              void run(async () => {
                await disablePush();
                setState('off');
              })
            }
          >
            {w.disable}
          </button>
        </div>
      )}
      {msg && (
        <p role="status" className="text-xs text-slate-600 dark:text-slate-300">
          {msg}
        </p>
      )}
    </section>
  );
}

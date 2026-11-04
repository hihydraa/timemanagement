import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { t } from '../lib/i18n';
import type { GcalStatus } from '../lib/types';

interface Props {
  /** ผลจากการ redirect กลับจาก Google (?gcal=...) */
  notice: { kind: 'ok' | 'error'; text: string } | null;
  onClose: () => void;
  onStatusChange: (s: GcalStatus) => void;
}

interface Progress {
  running: boolean;
  processed: number;
  created: number;
  updated: number;
  deleted: number;
  failed: number;
  reasons: string[];
  done: boolean;
}
const ZERO: Progress = {
  running: false,
  processed: 0,
  created: 0,
  updated: 0,
  deleted: 0,
  failed: 0,
  reasons: [],
  done: false,
};
const MAX_BATCHES = 500; // กันวนไม่รู้จบ

export default function GcalDialog({ notice, onClose, onStatusChange }: Props) {
  const [st, setSt] = useState<GcalStatus | null>(null);
  const [calId, setCalId] = useState('primary');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<Progress>(ZERO);
  const closeRef = useRef<HTMLButtonElement>(null);

  // เก็บ callback ล่าสุดไว้ใน ref: effect ด้านล่างจะได้รันครั้งเดียวตอนเปิดหน้าต่าง
  // (ถ้าใส่ onClose/onStatusChange ใน deps จะดึงสถานะซ้ำและวนกับหน้าแม่ไม่สิ้นสุด)
  const cb = useRef({ onClose, onStatusChange });
  cb.current = { onClose, onStatusChange };

  const apply = useCallback((s: GcalStatus) => {
    setSt(s);
    setCalId(s.calendarId);
    cb.current.onStatusChange(s);
  }, []);

  useEffect(() => {
    api
      .gcalStatus()
      .then(apply)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : t.error.generic));
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cb.current.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apply]);

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setError('');
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  // เปลี่ยนในหน้าทันที (optimistic) แล้วย้อนกลับถ้าเซิร์ฟเวอร์ปฏิเสธ
  const toggleSync = async (on: boolean) => {
    const prev = st;
    setError('');
    setSt((cur) => (cur ? { ...cur, syncEnabled: on } : cur));
    setBusy(true);
    try {
      apply(await api.gcalSettings({ syncEnabled: on }));
    } catch (e) {
      setSt(prev);
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  };
  const saveCal = () => run(() => api.gcalSettings({ calendarId: calId.trim() }).then(apply));
  const disconnect = async () => {
    if (!window.confirm(t.gcal.confirmDisconnect)) return;
    await run(() => api.gcalDisconnect().then(apply));
    setProg(ZERO);
  };

  async function resyncAll() {
    setError('');
    let p: Progress = { ...ZERO, running: true };
    setProg(p);
    let cursor: string | null = null;
    try {
      for (let i = 0; i < MAX_BATCHES; i++) {
        const r = await api.gcalResync(cursor);
        p = {
          ...p,
          processed: p.processed + r.processed,
          created: p.created + r.created,
          updated: p.updated + r.updated,
          deleted: p.deleted + r.deleted,
          failed: p.failed + r.failed,
          reasons: [...new Set([...p.reasons, ...r.reasons])],
        };
        setProg(p);
        cursor = r.nextCursor;
        if (!cursor) break;
      }
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    }
    setProg({ ...p, running: false, done: true });
    api
      .gcalStatus()
      .then(apply)
      .catch(() => undefined);
  }

  const reason = (r: string) => t.gcal.reasons[r] ?? `รหัสข้อผิดพลาด: ${r}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gcal-title"
    >
      <div className="max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 id="gcal-title" className="text-lg font-semibold">
            {t.gcal.title}
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

        {notice && (
          <p
            role="status"
            className={`rounded p-2 text-sm ${notice.kind === 'ok' ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}
          >
            {notice.text}
          </p>
        )}

        {!st && !error && <p role="status">{t.loading}</p>}

        {st && !st.configured && (
          <p className="text-sm text-slate-600 dark:text-slate-300">{t.gcal.notConfigured}</p>
        )}

        {st?.configured && (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t.gcal.intro}</p>

            {st.needsReconnect && (
              <p
                role="alert"
                className="rounded bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              >
                {t.gcal.needsReconnect}
              </p>
            )}

            {!st.connected && (
              <a
                href="/auth/google/connect"
                className="inline-block rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {st.needsReconnect ? t.gcal.reconnect : t.gcal.connect}
              </a>
            )}

            {st.connected && (
              <div className="space-y-3 text-sm">
                <p>
                  {t.gcal.connectedAs} <strong>{st.email ?? '—'}</strong>
                </p>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={st.syncEnabled}
                    disabled={busy}
                    onChange={(e) => void toggleSync(e.target.checked)}
                  />
                  {t.gcal.autoSync}
                </label>

                <div>
                  <label
                    htmlFor="gcal-cal"
                    className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
                  >
                    {t.gcal.calendarId}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="gcal-cal"
                      value={calId}
                      onChange={(e) => setCalId(e.target.value)}
                      className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                    />
                    <button
                      type="button"
                      disabled={busy || calId.trim() === st.calendarId}
                      onClick={() => void saveCal()}
                      className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800"
                    >
                      {t.gcal.save}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={busy || prog.running || !st.syncEnabled}
                    onClick={() => void resyncAll()}
                    className="rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {prog.running ? t.gcal.resyncing : t.gcal.resync}
                  </button>
                  {(prog.running || prog.done) && (
                    <p role="status" className="text-xs text-slate-600 dark:text-slate-300">
                      {prog.done && !prog.running ? `${t.gcal.resyncDone} · ` : ''}
                      {prog.processed} งาน — {t.gcal.created} {prog.created} · {t.gcal.updated}{' '}
                      {prog.updated} · {t.gcal.deleted} {prog.deleted} · {t.gcal.failed}{' '}
                      {prog.failed}
                    </p>
                  )}
                  {prog.reasons.map((r) => (
                    <p
                      key={r}
                      role="alert"
                      className="rounded bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    >
                      {reason(r)}
                    </p>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void disconnect()}
                  className="rounded px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  {t.gcal.disconnect}
                </button>
              </div>
            )}
          </>
        )}

        {error && (
          <p
            role="alert"
            className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

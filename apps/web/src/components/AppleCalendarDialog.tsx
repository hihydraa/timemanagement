import { useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { t } from '../lib/i18n';
import type { CalendarFeed } from '../lib/types';

/** เชื่อม Apple Calendar: ลิงก์สมัครรับ (ICS subscription) — ทางเดียว Dobby → ปฏิทิน */
export default function AppleCalendarDialog({ onClose }: { onClose: () => void }) {
  const [feed, setFeed] = useState<CalendarFeed | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    api
      .calendarFeed()
      .then(setFeed)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : t.error.generic));
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const run = async (fn: () => Promise<CalendarFeed>) => {
    setError('');
    setBusy(true);
    try {
      setFeed(await fn());
      setCopied(false);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!feed?.url) return;
    try {
      await navigator.clipboard.writeText(feed.url);
      setCopied(true);
    } catch {
      setError(t.error.generic); // เบราว์เซอร์ไม่อนุญาต: ผู้ใช้เลือกข้อความในช่องแล้วคัดลอกเองได้
    }
  };
  const btn =
    'rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apple-title"
    >
      <div className="max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 id="apple-title" className="text-lg font-semibold">
            {t.apple.title}
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
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.apple.intro}</p>
        {error && (
          <p
            role="alert"
            className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        )}
        {!feed && !error && <p role="status">{t.loading}</p>}

        {feed && !feed.enabled && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(api.calendarFeedCreate)}
            className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t.apple.enabling : t.apple.enable}
          </button>
        )}

        {feed?.enabled && feed.url && (
          <div className="space-y-3 text-sm">
            <div>
              <a
                href={feed.webcalUrl ?? feed.url}
                className="inline-block rounded bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
              >
                🍎 {t.apple.openBtn}
              </a>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{t.apple.openHint}</p>
            </div>
            <div>
              <label
                htmlFor="apple-url"
                className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                {t.apple.copyLabel}
              </label>
              <div className="flex gap-2">
                <input
                  id="apple-url"
                  readOnly
                  value={feed.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
                />
                <button type="button" onClick={() => void copy()} className={btn}>
                  {copied ? t.apple.copied : t.apple.copy}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">{t.apple.manual}</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">{t.apple.includes}</p>
            <p
              role="note"
              className="rounded bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            >
              <span aria-hidden>🔒 </span>
              {t.apple.secret}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className={btn}
                onClick={() =>
                  window.confirm(t.apple.confirmRotate) && void run(api.calendarFeedCreate)
                }
              >
                {t.apple.rotate}
              </button>
              <button
                type="button"
                disabled={busy}
                className={btn}
                onClick={() =>
                  window.confirm(t.apple.confirmDisable) && void run(api.calendarFeedDisable)
                }
              >
                {t.apple.disable}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

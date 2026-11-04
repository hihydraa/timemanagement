import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { t } from '../lib/i18n';

const fmt = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.max(0, sec % 60)).padStart(2, '0')}`;

export default function LineDialog({ onClose }: { onClose: () => void }) {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [justLinked, setJustLinked] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.lineStatus();
      setLinked((prev) => {
        if (prev === false && s.linked) setJustLinked(true);
        return s.linked;
      });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    }
  }, []);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    void refresh();
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [refresh]);

  // นับถอยหลัง + ตรวจสถานะทุก 3 วินาทีระหว่างรอผู้ใช้พิมพ์รหัสใน LINE
  useEffect(() => {
    if (!code || linked) return;
    const tick = () => setLeft(Math.max(0, Math.round((code.expiresAt - Date.now()) / 1000)));
    tick();
    const a = setInterval(tick, 1000);
    const b = setInterval(() => void refresh(), 3000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [code, linked, refresh]);

  async function getCode() {
    setError('');
    setCopied(false);
    try {
      const r = await api.lineLinkCode();
      setCode({ code: r.code, expiresAt: Date.parse(r.expiresAt) });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    }
  }

  async function unlink() {
    if (!window.confirm(t.line.confirmUnlink)) return;
    try {
      await api.lineUnlink();
      setLinked(false);
      setCode(null);
      setJustLinked(false);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`ผูกบัญชี ${code.code}`);
      setCopied(true);
    } catch {
      /* ไม่มีสิทธิ์ clipboard: ผู้ใช้คัดลอกเองได้ */
    }
  }

  const expired = !!code && left === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="line-title"
    >
      <div className="w-full max-w-sm space-y-3 rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 id="line-title" className="text-lg font-semibold">
            {t.line.title}
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

        {linked === null && !error && <p role="status">{t.loading}</p>}

        {linked && (
          <div className="space-y-3">
            <p role="status" className="font-medium text-green-700 dark:text-green-400">
              {justLinked ? t.line.success : t.line.linked}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t.line.linkedHint}</p>
            <button
              type="button"
              onClick={unlink}
              className="rounded px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              {t.line.unlink}
            </button>
          </div>
        )}

        {linked === false && (
          <div className="space-y-3 text-sm">
            <p>{t.line.step1}</p>
            <button
              type="button"
              onClick={getCode}
              className="rounded bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
            >
              {code ? t.line.newCode : t.line.getCode}
            </button>
            {code && (
              <>
                <p>{t.line.step2}</p>
                <div className="rounded-lg border border-slate-300 p-3 text-center dark:border-slate-600">
                  <p className="text-xs text-slate-500">ผูกบัญชี</p>
                  <p
                    data-testid="link-code"
                    className="font-mono text-3xl font-bold tracking-widest"
                    aria-label={`รหัส ${code.code.split('').join(' ')}`}
                  >
                    {code.code}
                  </p>
                  <p className={`mt-1 text-xs ${expired ? 'text-red-600' : 'text-slate-500'}`}>
                    {expired ? t.line.expired : `${t.line.expiresIn} ${fmt(left)}`}
                  </p>
                </div>
                {!expired && (
                  <>
                    <button
                      type="button"
                      onClick={copy}
                      className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                    >
                      {copied ? t.line.copied : t.line.copy}
                    </button>
                    <p role="status" className="text-xs text-slate-500">
                      {t.line.waiting}
                    </p>
                  </>
                )}
              </>
            )}
          </div>
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

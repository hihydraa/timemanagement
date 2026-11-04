import { useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { t } from '../lib/i18n';
import DeleteAccount from './DeleteAccount';
import type { NotificationSettings, PushStatus } from '../lib/types';

interface Props {
  onClose: () => void;
  onOpenLine: () => void;
  onSaved: () => void;
}

const field =
  'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800';

export default function SettingsDialog({ onClose, onOpenLine, onSaved }: Props) {
  const [s, setS] = useState<NotificationSettings | null>(null);
  const [linked, setLinked] = useState(true);
  const [push, setPush] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    api
      .getSettings()
      .then((v) => {
        setS(v.settings);
        setLinked(v.lineLinked);
      })
      .catch((e) => setError(e instanceof ApiClientError ? e.message : t.error.generic));
    api
      .pushStatus()
      .then(setPush)
      .catch(() => undefined);
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const set = <K extends keyof NotificationSettings>(k: K, v: NotificationSettings[K]) => {
    setSaved(false);
    setS((cur) => (cur ? { ...cur, [k]: v } : cur));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    setError('');
    try {
      const v = await api.patchSettings(s);
      setS(v.settings);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  }

  const pct = push && push.limit > 0 ? Math.min(100, (push.used / push.limit) * 100) : 0;
  const timeInput = (
    id: string,
    label: string,
    key: keyof NotificationSettings,
    disabled = false,
  ) => (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
      >
        {label}
      </label>
      <input
        id={id}
        type="time"
        required
        disabled={disabled}
        value={String(s?.[key] ?? '')}
        onChange={(e) => set(key, e.target.value as never)}
        className={`${field} w-full`}
      />
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <form
        onSubmit={save}
        className="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <h2 id="settings-title" className="text-lg font-semibold">
            {t.settings.title}
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

        {!s && !error && <p role="status">{t.loading}</p>}

        {!linked && s && (
          <p
            role="alert"
            className="rounded bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          >
            {t.settings.notLinked}{' '}
            <button type="button" onClick={onOpenLine} className="font-medium underline">
              {t.settings.linkNow}
            </button>
          </p>
        )}

        {s && (
          <>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={s.lineNotifyEnabled}
                onChange={(e) => set('lineNotifyEnabled', e.target.checked)}
              />
              {t.settings.master}
            </label>
            <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t.settings.windowHint}
            </p>

            <fieldset disabled={!s.lineNotifyEnabled} className="space-y-3 disabled:opacity-50">
              <div className="grid grid-cols-2 gap-3">
                {timeInput('st-morning', t.settings.morning, 'morningDigestTime')}
                {timeInput('st-deadline', t.settings.deadline, 'deadlineAlertTime')}
                {timeInput(
                  'st-evening',
                  t.settings.evening,
                  'eveningReviewTime',
                  !s.eveningReviewEnabled,
                )}
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={s.eveningReviewEnabled}
                    onChange={(e) => set('eveningReviewEnabled', e.target.checked)}
                  />
                  {t.settings.eveningOn}
                </label>
              </div>

              <div>
                <label
                  htmlFor="st-remind"
                  className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  {t.settings.remind}
                </label>
                <input
                  id="st-remind"
                  type="number"
                  min={0}
                  max={1440}
                  step={1}
                  required
                  value={s.remindBeforeMinutes}
                  onChange={(e) => set('remindBeforeMinutes', Number(e.target.value))}
                  className={`${field} w-28`}
                />
              </div>

              <fieldset className="space-y-1">
                <legend className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {t.settings.quiet}
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  {timeInput('st-qs', t.settings.quietFrom, 'quietHoursStart')}
                  {timeInput('st-qe', t.settings.quietTo, 'quietHoursEnd')}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.settings.quietHint}</p>
              </fieldset>
            </fieldset>
          </>
        )}

        {push && (
          <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
            <div>
              {t.settings.quota}: {push.limitConfigured ? `${push.used} / ${push.limit}` : '—'}
            </div>
            {push.limitConfigured && (
              <div
                className="h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-slate-700"
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t.settings.quota}
              >
                <div
                  className={`h-full ${push.exhausted ? 'bg-red-500' : push.nearLimit ? 'bg-amber-500' : 'bg-brand-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            {!push.limitConfigured && (
              <p className="text-amber-700 dark:text-amber-400">{t.settings.quotaNotSet}</p>
            )}
            {push.limitConfigured && push.exhausted && (
              <p className="text-red-600">{t.settings.quotaFull}</p>
            )}
            {push.limitConfigured && !push.exhausted && push.nearLimit && (
              <p className="text-amber-700 dark:text-amber-400">{t.settings.quotaNear}</p>
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

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !s}
            className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {t.settings.save}
          </button>
          {saved && (
            <span role="status" className="text-sm text-green-700 dark:text-green-400">
              {t.settings.saved}
            </span>
          )}
        </div>
      </form>
      <DeleteAccount />
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { useApp } from '../lib/appContext';
import { callName, MASTER, type Honorific } from '../lib/game';
import { DEFAULT_DOBBY_NAME, TONES, sayDobby, type ToneId } from '../../../../src/lib/dobbyVoice';
import { t } from '../lib/i18n';
import Mascot from './Mascot';

const MODES: Honorific[] = ['name', 'master', 'both'];

/** ตั้งค่า Dobby: ชื่อที่ให้เรียกผู้ใช้ ชื่อของ Dobby และโทนการพูด (มีตัวอย่างประโยคสดตามที่กรอก) */
export default function DobbyDialog({ onClose }: { onClose: () => void }) {
  const { game, setGame } = useApp();
  const p = game?.profile;
  const [mode, setMode] = useState<Honorific>(p?.honorific ?? 'name');
  const [name, setName] = useState(p?.displayName ?? '');
  const [dobby, setDobby] = useState(p?.dobbyName ?? '');
  const [tone, setTone] = useState<ToneId>(p?.tone ?? 'playful');
  const [seed, setSeed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const cb = useRef(onClose);
  cb.current = onClose;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cb.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const you = callName({ displayName: name, honorific: mode });
  const dobbyShown = dobby.trim() || DEFAULT_DOBBY_NAME;
  const sample = useMemo(
    () =>
      sayDobby('complete', { you, dobby: dobbyShown }, tone, () => ((seed * 0.37) % 1) + 0.0001),
    [you, dobbyShown, tone, seed],
  );

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode !== 'master' && !name.trim()) {
      setError(t.dobbyDlg.needName);
      return;
    }
    setBusy(true);
    try {
      setGame(
        await api.saveProfile({
          displayName: name.trim(),
          honorific: mode,
          dobbyName: dobby.trim(),
          tone,
        }),
      );
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t.dobbyDlg.failed);
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dobby-title"
    >
      <form
        onSubmit={save}
        className="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mascot pose="hello" height={48} />
            <h2 id="dobby-title" className="text-lg font-semibold">
              {t.dobbyDlg.title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t.form.close}
            className="rounded px-2 py-1 text-xl leading-none hover:bg-cool-100 dark:hover:bg-slate-800"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.dobbyDlg.intro}</p>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold">{t.dobbyDlg.callTitle}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${mode === m ? 'border-brand-600 bg-brand-50 dark:bg-brand-950' : 'border-slate-300 dark:border-slate-600'}`}
              >
                <input
                  type="radio"
                  name="dobby-mode"
                  className="accent-brand-600"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                {t.dobbyDlg.call[m]}
              </label>
            ))}
          </div>
          {mode !== 'master' && (
            <label className="block text-xs">
              {t.dobbyDlg.yourName}
              <input
                className={field}
                maxLength={30}
                value={name}
                placeholder={t.dobbyDlg.yourNamePh}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
        </fieldset>

        <label className="block text-xs">
          {t.dobbyDlg.dobbyName}
          <input
            className={field}
            maxLength={20}
            value={dobby}
            placeholder={t.dobbyDlg.dobbyNamePh}
            onChange={(e) => setDobby(e.target.value)}
          />
        </label>

        <fieldset className="space-y-1">
          <legend className="mb-1 text-sm font-semibold">{t.dobbyDlg.tone}</legend>
          <div className="flex flex-wrap gap-2">
            {TONES.map((x) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={tone === x.id}
                onClick={() => setTone(x.id)}
                className={`rounded-full px-3 py-1.5 text-sm ${tone === x.id ? 'bg-brand-600 font-medium text-white' : 'border border-slate-300 dark:border-slate-600'}`}
              >
                {x.th}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">{t.dobbyDlg.toneMore}</p>
        </fieldset>

        <div className="rounded-xl bg-cool-100 p-3 dark:bg-slate-800">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t.dobbyDlg.preview}
          </p>
          <p className="mt-1 text-sm" role="status" aria-live="polite">
            <strong>{dobbyShown}:</strong> {sample}
          </p>
          <button
            type="button"
            onClick={() => setSeed((n) => n + 1)}
            className="mt-1 text-xs text-iris-600 underline dark:text-iris-400"
          >
            {t.dobbyDlg.another}
          </button>
          {mode === 'master' && (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              ({MASTER} จะถูกใช้เป็นคำเรียก)
            </p>
          )}
        </div>

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
            disabled={busy}
            className="rounded-full bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t.dobbyDlg.saving : t.dobbyDlg.save}
          </button>
          {!p && (
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {t.dobbyDlg.firstTime}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

import { useState } from 'react';
import { api, ApiClientError } from '../../lib/api';
import { CHARACTERS, callName, getCharacter, type Honorific } from '../../lib/game';
import { t } from '../../lib/i18n';
import type { GameState } from '../../lib/game';
import { CharacterImage } from './GameImage';

const OPTIONS: { id: Honorific; label: string }[] = [
  { id: 'name', label: t.game.callName },
  { id: 'master', label: t.game.callMaster },
  { id: 'both', label: t.game.callBoth },
];

/** เลือกตัวละคร + ตั้งชื่อ + เลือกว่าให้ Dobby เรียกว่าอะไร (ใช้ทั้งใน onboarding และหน้าแก้ไข) */
export default function CharacterCreator({
  initial,
  submitLabel,
  onSaved,
  onSkip,
}: {
  initial?: GameState['profile'];
  submitLabel: string;
  onSaved: (s: GameState) => void;
  onSkip?: () => void;
}) {
  const [ch, setCh] = useState(initial?.characterId ?? '');
  const [name, setName] = useState(initial?.displayName ?? '');
  const [hon, setHon] = useState<Honorific>(initial?.honorific ?? 'name');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const g = t.game;
  const preview = callName({ displayName: name, honorific: hon });
  const need = hon !== 'master' && !name.trim();

  async function save() {
    setError('');
    setBusy(true);
    try {
      onSaved(await api.saveProfile({ characterId: ch, displayName: name.trim(), honorific: hon }));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">{g.pickCharacter}</legend>
        <div className="grid grid-cols-3 gap-2">
          {CHARACTERS.map((c) => (
            <label
              key={c.id}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-1.5 text-center text-xs ${ch === c.id ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-950' : 'border-slate-300 dark:border-slate-600'}`}
            >
              <input
                type="radio"
                name="character"
                value={c.id}
                checked={ch === c.id}
                onChange={() => setCh(c.id)}
                className="sr-only"
              />
              <CharacterImage id={c.id} alt="" height={96} />
              <span className="font-medium">{c.th}</span>
              {ch === c.id && <span aria-hidden>✓</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="char-name" className="mb-1 block text-sm font-semibold">
          {g.yourName}
        </label>
        <input
          id="char-name"
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          placeholder={g.namePh}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
        />
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">{g.callMe}</legend>
        <div className="space-y-1">
          {OPTIONS.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="honorific"
                checked={hon === o.id}
                onChange={() => setHon(o.id)}
                className="h-4 w-4 accent-brand-600"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="rounded-lg bg-brand-50 p-2 text-sm dark:bg-brand-950" aria-live="polite">
        <strong>Dobby:</strong> “{g.hello.replace('{name}', preview ?? '…')}”
        {ch && (
          <span className="block text-xs text-slate-600 dark:text-slate-300">
            {g.youAre.replace('{c}', getCharacter(ch)?.th ?? '')}
          </span>
        )}
      </p>

      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-slate-600 underline dark:text-slate-300"
          >
            {g.later}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={busy || !ch || need}
          onClick={() => void save()}
          className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

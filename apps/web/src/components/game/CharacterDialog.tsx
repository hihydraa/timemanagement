import { useEffect, useRef } from 'react';
import { useApp } from '../../lib/appContext';
import { t } from '../../lib/i18n';
import CharacterCreator from './CharacterCreator';

/** หน้าต่างสร้าง/แก้ตัวละคร */
export default function CharacterDialog({ onClose }: { onClose: () => void }) {
  const { game, setGame } = useApp();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const g = t.game;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="char-title"
    >
      <div className="max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 id="char-title" className="text-lg font-semibold">
            {game?.profile ? g.editTitle : g.createTitle}
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
        {!game?.profile && (
          <p className="text-sm text-slate-600 dark:text-slate-300">{g.welcomeBonus}</p>
        )}
        <CharacterCreator
          initial={game?.profile}
          submitLabel={game?.profile ? g.save : g.create}
          onSaved={(s) => {
            setGame(s);
            onClose();
          }}
        />
      </div>
    </div>
  );
}

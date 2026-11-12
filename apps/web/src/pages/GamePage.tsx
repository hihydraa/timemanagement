import { useMemo, useState } from 'react';
import { CharacterImage, ItemImage } from '../components/game/GameImage';
import { api, ApiClientError } from '../lib/api';
import { useApp } from '../lib/appContext';
import { CHARACTERS, ITEMS, MASTER, callName, getCharacter, getItem, type Item } from '../lib/game';
import { t } from '../lib/i18n';

const card =
  'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800';

/** ตัวละคร + ตู้เสื้อผ้า + ร้านค้า: ซื้อเครื่องแต่งกาย/สัตว์ประจำตัวด้วยแต้มที่ได้จากการสร้างและทำงานให้เสร็จ */
export default function GamePage() {
  const { game, setGame, openCharacter } = useApp();
  const g = t.game;
  const [coll, setColl] = useState(game?.profile?.characterId ?? CHARACTERS[0]!.id);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const owned = useMemo(
    () => new Map((game?.inventory ?? []).map((i) => [i.itemId, i.equipped])),
    [game],
  );
  const equipped = (game?.inventory ?? [])
    .filter((i) => i.equipped)
    .map((i) => getItem(i.itemId))
    .filter((x): x is Item => !!x);
  const pet = equipped.find((x) => x.slot === 'companion');
  const wearing = equipped.filter((x) => x.slot !== 'companion');
  const list = ITEMS.filter((i) => i.collection === coll);

  async function run(fn: () => Promise<typeof game>, ok?: string) {
    setBusy(true);
    setMsg('');
    try {
      const s = await fn();
      if (s) setGame(s);
      if (ok) setMsg(ok);
    } catch (e) {
      setMsg(e instanceof ApiClientError ? e.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  }

  if (!game)
    return (
      <p role="status" className="py-6 text-center">
        {t.loading}
      </p>
    );
  const p = game.profile;
  const ch = p ? getCharacter(p.characterId) : null;
  const call = callName(p);

  return (
    <div className="space-y-3">
      <section className={`${card} flex flex-wrap items-center gap-4`} aria-label={g.title}>
        {p && ch ? (
          <>
            <CharacterImage id={p.characterId} alt={ch.th} height={150} />
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="text-lg font-bold text-brand-800 dark:text-brand-200">
                {p.honorific === 'master' ? MASTER : p.displayName}
                <span className="ml-2 text-sm font-normal text-slate-600 dark:text-slate-300">
                  ({ch.th})
                </span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Dobby {g.callsYou} “{call}”
              </p>
              <p className="text-2xl font-bold tabular-nums">
                <span aria-hidden>🪙 </span>
                {game.balance} <span className="text-sm font-normal">{g.points}</span>
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {g.today.replace('{n}', String(game.todayEarned))}
              </p>
              <button
                type="button"
                onClick={openCharacter}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
              >
                {g.edit}
              </button>
            </div>
            <div className="w-full">
              <h3 className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                {g.wearing}
              </h3>
              {wearing.length === 0 && !pet ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">{g.nothingWorn}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {wearing.map((it) => (
                    <li key={it.id} className="text-center text-[11px]">
                      <ItemImage item={it} size={56} />
                      <span className="block max-w-14 truncate">{it.th}</span>
                    </li>
                  ))}
                  {pet && (
                    <li className="text-center text-[11px]">
                      <ItemImage item={pet} size={84} />
                      <span className="block max-w-20 truncate">🐾 {pet.th}</span>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm">{g.noCharacter}</p>
            <button
              type="button"
              onClick={openCharacter}
              className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              {g.create} ({g.bonusShort})
            </button>
          </div>
        )}
      </section>

      <section className={card} aria-label={g.earn}>
        <h2 className="text-base font-semibold">{g.earn}</h2>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700 dark:text-slate-200">
          {g.earnRules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section className={card} aria-label={g.shop}>
        <h2 className="mb-2 text-base font-semibold">🛍 {g.shop}</h2>
        <div
          role="tablist"
          aria-label={g.collections}
          className="mb-3 flex gap-1 overflow-x-auto pb-1"
        >
          {CHARACTERS.map((c) => (
            <button
              key={c.id}
              role="tab"
              type="button"
              aria-selected={coll === c.id}
              onClick={() => setColl(c.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${coll === c.id ? 'bg-brand-600 font-medium text-white' : 'border border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700'}`}
            >
              {g.collection.replace('{c}', c.th)}
            </button>
          ))}
        </div>
        {msg && (
          <p role="status" className="mb-2 rounded bg-brand-50 p-2 text-sm dark:bg-brand-950">
            {msg}
          </p>
        )}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((it) => {
            const has = owned.has(it.id);
            const on = owned.get(it.id) === true;
            const missing = it.price - game.balance;
            return (
              <li
                key={it.id}
                className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center ${it.slot === 'companion' ? 'col-span-2 sm:col-span-1' : ''} ${on ? 'border-brand-600 ring-2 ring-brand-600' : 'border-slate-200 dark:border-slate-700'}`}
              >
                <ItemImage item={it} size={it.slot === 'companion' ? 160 : 112} />
                <strong className="text-sm leading-tight">
                  {it.slot === 'companion' && <span aria-hidden>🐾 </span>}
                  {it.th}
                </strong>
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  {t.game.slots[it.slot]}
                </span>
                {has ? (
                  <button
                    type="button"
                    disabled={busy || !p}
                    onClick={() => void run(() => api.equipItem(it.id, !on))}
                    className={`mt-auto w-full rounded-full px-3 py-1.5 text-xs font-medium ${on ? 'bg-brand-600 text-white' : 'border border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700'}`}
                  >
                    {on ? `✓ ${g.worn} · ${g.takeOff}` : g.wear}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy || !p || missing > 0}
                    onClick={() =>
                      void run(() => api.buyItem(it.id), g.bought.replace('{n}', it.th))
                    }
                    className="mt-auto w-full rounded-full bg-amber-500 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-amber-400 disabled:bg-slate-200 disabled:text-slate-600 dark:disabled:bg-slate-700 dark:disabled:text-slate-300"
                  >
                    <span aria-hidden>🪙 </span>
                    {it.price}
                    {missing > 0 && ` · ${g.missing.replace('{n}', String(missing))}`}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

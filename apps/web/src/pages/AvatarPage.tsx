import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Avatar2D from '../components/avatar/Avatar2D';
import { api, ApiClientError, type Avatar2dState } from '../lib/api';
import {
  AVATAR_ITEMS,
  DEFAULT_LOOK,
  HAIR_COLORS,
  SKINS,
  SLOTS,
  SLOT_FOCUS,
  SLOT_TH,
  type AvatarItem,
  type AvatarLook,
  type AvatarSlot,
} from '../lib/avatar2d';
import { setAvatarLook } from '../lib/avatarLook';
import { t } from '../lib/i18n';

type Status = 'idle' | 'saving' | 'saved' | 'failed';
/** ช่องที่ถอดออกได้ (เว้นว่างได้) — ทุกช่องเว้นว่างได้ */
const GROUPS: AvatarSlot[] = [...SLOTS];

const swatch = (on: boolean) =>
  `h-9 w-9 rounded-full border-2 transition ${on ? 'border-brand-600 ring-2 ring-brand-300' : 'border-white shadow dark:border-slate-700'}`;

/**
 * แท็บ "ตัวละคร" ในหน้าฉัน: แต่งตัวละคร 2D (สีผิว/สีผม/ทรงผม/ชุด/เครื่องประดับ/สัตว์เลี้ยง)
 * ของฟรีใส่ได้ทันที ที่เหลือปลดล็อกด้วยแต้มจากการทำงานเสร็จ — เลือกแล้วบันทึกทันที (ใช้ได้ทุกเครื่อง)
 */
export default function AvatarPage() {
  const [state, setState] = useState<Avatar2dState | null>(null);
  const [look, setLook] = useState<AvatarLook>(DEFAULT_LOOK);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [open, setOpen] = useState<AvatarSlot>('hair');
  /** คิวบันทึก: เรียงทีละคำขอ กันค่าเก่าไปเขียนทับของใหม่ */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    api
      .getAvatar2d()
      .then((s) => {
        if (!alive.current) return;
        setState(s);
        if (s.look) setLook(s.look);
      })
      .catch(() => alive.current && setError(t.me.avatarLoadFailed));
    return () => {
      alive.current = false;
    };
  }, []);

  const persist = useCallback((next: AvatarLook) => {
    queue.current = queue.current.then(async () => {
      if (alive.current) setStatus('saving');
      try {
        const s = await api.saveAvatarLook(next);
        setAvatarLook(s.look);
        if (alive.current) {
          setState(s);
          setStatus('saved');
        }
      } catch (e) {
        if (alive.current) {
          setStatus('failed');
          setError(e instanceof ApiClientError ? e.message : t.me.avatarSaveFailed);
        }
      }
    });
  }, []);

  const change = (next: AvatarLook) => {
    setError('');
    setLook(next);
    persist(next);
  };

  const owned = useMemo(() => new Set(state?.owned ?? []), [state]);
  const items = useMemo(() => AVATAR_ITEMS.filter((i) => i.slot === open), [open]);
  const balance = state?.balance ?? 0;

  const equip = (item: AvatarItem) => {
    const on = look.items[item.slot] === item.id;
    const nextItems = { ...look.items };
    if (on) delete nextItems[item.slot];
    else nextItems[item.slot] = item.id;
    change({ ...look, items: nextItems });
  };

  const buy = async (item: AvatarItem) => {
    setError('');
    try {
      const s = await api.buyAvatarItem(item.id);
      setState(s);
      // ซื้อแล้วสวมให้ทันที
      change({ ...look, items: { ...look.items, [item.slot]: item.id } });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    }
  };

  if (!state && !error) return <p role="status">{t.loading}</p>;

  const statusText =
    status === 'saving'
      ? t.me.avatarSaving
      : status === 'saved'
        ? t.me.avatarSaved
        : status === 'failed'
          ? t.me.avatarSaveFailed
          : '';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-brand-50 to-white p-3 dark:border-slate-700 dark:from-slate-800 dark:to-slate-900">
            <Avatar2D look={look} label={t.me.avatar} className="mx-auto w-full max-w-[240px]" />
          </div>
          <p className="text-center text-sm">
            <span aria-hidden>⭐ </span>
            {t.me.avatarPoints.replace('{n}', String(balance))}
          </p>
          <p
            role="status"
            aria-live="polite"
            className="min-h-[1rem] text-center text-xs text-slate-600 dark:text-slate-300"
          >
            {statusText}
          </p>
        </div>

        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t.me.avatarSkin}</legend>
            <div className="flex flex-wrap gap-2">
              {SKINS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={s.th}
                  title={s.th}
                  aria-pressed={look.skin === s.id}
                  onClick={() => change({ ...look, skin: s.id })}
                  className={swatch(look.skin === s.id)}
                  style={{ background: s.color }}
                />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t.me.avatarHairColor}</legend>
            <div className="flex flex-wrap gap-2">
              {HAIR_COLORS.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  aria-label={h.th}
                  title={h.th}
                  aria-pressed={look.hairColor === h.id}
                  onClick={() => change({ ...look, hairColor: h.id })}
                  className={swatch(look.hairColor === h.id)}
                  style={{ background: h.color }}
                />
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <div role="tablist" aria-label={t.me.avatarParts} className="flex gap-1 overflow-x-auto pb-1">
        {GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={open === g}
            onClick={() => setOpen(g)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${open === g ? 'bg-brand-600 font-medium text-white' : 'border border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'}`}
          >
            {SLOT_TH[g]}
          </button>
        ))}
      </div>

      <ul
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
        aria-label={SLOT_TH[open]}
      >
        <li>
          <button
            type="button"
            aria-pressed={!look.items[open]}
            onClick={() => {
              const nextItems = { ...look.items };
              delete nextItems[open];
              change({ ...look, items: nextItems });
            }}
            className={`flex h-full w-full flex-col items-center justify-center gap-1 rounded-2xl border p-2 text-sm ${!look.items[open] ? 'border-brand-600 bg-brand-50 dark:bg-brand-950' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
          >
            <span aria-hidden className="text-2xl">
              ∅
            </span>
            {t.me.avatarNone}
          </button>
        </li>
        {items.map((item) => {
          const have = owned.has(item.id);
          const worn = look.items[item.slot] === item.id;
          const can = balance >= item.price;
          return (
            <li
              key={item.id}
              className={`flex flex-col items-center gap-1 rounded-2xl border p-2 ${worn ? 'border-brand-600 bg-brand-50 dark:bg-brand-950' : 'border-slate-200 dark:border-slate-700'}`}
            >
              <Avatar2D
                look={{ ...look, items: { ...look.items, [item.slot]: item.id } }}
                label=""
                viewBox={SLOT_FOCUS[item.slot]}
                className="w-20"
              />
              <span className="text-center text-xs font-medium">{item.th}</span>
              {have ? (
                <button
                  type="button"
                  aria-pressed={worn}
                  onClick={() => equip(item)}
                  className={`rounded-full px-3 py-1 text-xs ${worn ? 'bg-brand-600 text-white' : 'border border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700'}`}
                >
                  {worn ? `✓ ${t.me.avatarWorn}` : t.me.avatarWear}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!can}
                  onClick={() => void buy(item)}
                  title={
                    can ? '' : t.me.avatarNeedPoints.replace('{n}', String(item.price - balance))
                  }
                  className="rounded-full border border-amber-500 px-3 py-1 text-xs text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:text-amber-300 dark:hover:bg-amber-950"
                >
                  🔒 {t.me.avatarBuy.replace('{n}', String(item.price))}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p
          role="alert"
          className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">{t.me.avatarNote}</p>
    </div>
  );
}

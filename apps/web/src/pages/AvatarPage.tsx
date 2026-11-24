import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { avatarItemId, avatarItemPrice } from '../../../../src/lib/avatar';
import { api, type AvatarShop } from '../lib/api';
import { useApp } from '../lib/appContext';
import type { Honorific } from '../lib/game';
import {
  BODIES,
  HAIRS,
  OUTFITS,
  resolveOutfit,
  type BodyId,
  type HairId,
  type OutfitId,
} from '../lib/avatarModels';
import { setAvatarSnapshot } from '../lib/avatarSnapshot';
import { t } from '../lib/i18n';

const AvatarViewer = lazy(() => import('../components/avatar/AvatarViewer'));

type Choice = { body: BodyId; hair: HairId | null; outfit: OutfitId | null };
const DEFAULT: Choice = { body: 'female', hair: 'bob', outfit: null };
const keyOf = (c: Choice) => `${c.body}|${c.hair ?? ''}|${c.outfit ?? ''}`;
type Status = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * แท็บ "อวตาร" ในหน้าฉัน: เลือกตัวละคร/ทรงผม/ชุดแล้วดูแบบ 3D — บันทึกลงบัญชี (ใช้ได้ทุกเครื่อง)
 * เลือกแล้วบันทึกทันที และบันทึกซ้ำพร้อมภาพนิ่งเมื่อโมเดลโหลดเสร็จ (ภาพนี้ใช้แสดงมุมขวาล่าง)
 */
export default function AvatarPage() {
  const { game, setGame } = useApp();
  const [shop, setShop] = useState<AvatarShop>({ owned: [], balance: 0 });
  /** ของที่เลือกไว้อยู่แล้วในบัญชีก่อนมีระบบแต้ม (ใช้ต่อได้ ไม่ต้องซื้อ) */
  const [grand, setGrand] = useState<string[]>([]);
  /** ลองสวมของที่ยังล็อกเพื่อดูก่อนซื้อ (ไม่บันทึกลงบัญชี) */
  const [preview, setPreview] = useState<{ kind: 'hair' | 'outfit'; id: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [choice, setChoice] = useState<Choice | null>(null); // null = กำลังโหลดจากบัญชี
  const [status, setStatus] = useState<Status>('idle');
  /** ค่าที่เซิร์ฟเวอร์รับล่าสุด (null = ยังไม่มีอวตารในบัญชี) */
  const saved = useRef<{ key: string; hasSnapshot: boolean } | null>(null);
  /** ผู้ใช้เลือกเองแล้ว (ก่อนหน้านั้นไม่บันทึกค่าเริ่มต้นแทนผู้ใช้) */
  const touched = useRef(false);
  /** คิวบันทึก: เรียงทีละคำขอ กันภาพเก่าไปเขียนทับของใหม่ */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    api
      .getAvatar()
      .then(({ avatar: a, owned, balance }) => {
        if (!alive.current) return;
        setShop({ owned, balance });
        if (a) {
          setGrand(
            [
              a.hair ? `hair:${a.hair}` : '',
              a.outfit ? `outfit:${resolveOutfit(a.outfit)}` : '',
            ].filter(Boolean),
          );
          saved.current = { key: keyOf(a), hasSnapshot: !!a.snapshot };
          setChoice({
            body: a.body,
            hair: a.hair,
            outfit: a.outfit ? resolveOutfit(a.outfit) : null,
          });
        } else setChoice(DEFAULT);
      })
      .catch(() => {
        if (!alive.current) return;
        setChoice(DEFAULT);
        setStatus('failed');
      });
    return () => {
      alive.current = false;
    };
  }, []);

  const persist = (sel: Choice, snapshot: string | null) => {
    queue.current = queue.current.then(async () => {
      if (alive.current) setStatus('saving');
      try {
        const a = await api.saveAvatar({ ...sel, snapshot });
        saved.current = { key: keyOf(a), hasSnapshot: !!a.snapshot };
        if (alive.current) setStatus('saved');
      } catch {
        if (alive.current) setStatus('failed');
      }
    });
  };

  const pick = (next: Choice) => {
    touched.current = true;
    setChoice(next);
    persist(next, null);
  };

  // ตัวแสดงโมเดลถ่ายภาพเมื่อโหลดตัวละครครบ → บันทึกคู่กับตัวเลือก (ข้ามถ้าเซิร์ฟเวอร์มีค่านี้พร้อมภาพแล้ว)
  const onSnapshot = (url: string, sel: Choice) => {
    if (!saved.current && !touched.current) return;
    setAvatarSnapshot(url);
    const s = saved.current;
    if (s && s.key === keyOf(sel) && s.hasSnapshot) return;
    persist(sel, url);
  };

  const has = (kind: 'hair' | 'outfit', id: string) =>
    shop.owned.includes(`${kind}:${id}`) || grand.includes(`${kind}:${id}`);

  const unlock = async (kind: 'hair' | 'outfit', id: string) => {
    try {
      setShop(await api.unlockAvatarItem(kind, id));
      setPreview(null);
      setNotice(t.me.avatarUnlocked);
      if (choice)
        pick(
          kind === 'hair'
            ? { ...choice, hair: id as HairId }
            : { ...choice, outfit: id as OutfitId },
        );
    } catch {
      setNotice(t.me.avatarUnlockFailed);
    }
  };

  /** ปุ่มทรงผม/ชุด: ของที่ปลดล็อกแล้วสวมเลย ที่ยังล็อกให้ลองดูก่อนแล้วกดปลดล็อก */
  const choose = (kind: 'hair' | 'outfit', id: string) => {
    if (!choice) return;
    setNotice('');
    if (has(kind, id)) {
      setPreview(null);
      pick(
        kind === 'hair' ? { ...choice, hair: id as HairId } : { ...choice, outfit: id as OutfitId },
      );
    } else setPreview({ kind, id });
  };

  const saveName = async (displayName: string, honorific: Honorific) => {
    const first = !game?.profile;
    try {
      const g = await api.saveProfile({ displayName, honorific });
      setGame(g);
      const a = await api.getAvatar();
      setShop({ owned: a.owned, balance: a.balance });
      setNotice(first ? `${t.me.nameSaved} · ${t.me.nameWelcome}` : t.me.nameSaved);
    } catch {
      setNotice(t.me.nameSaveFailed);
    }
  };

  const btn = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-sm disabled:opacity-50 ${on ? 'bg-brand-600 font-medium text-white' : 'border border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'}`;

  if (!choice) return <p role="status">{t.loading}</p>;

  const label = (th: string, kind: 'hair' | 'outfit', id: string) =>
    has(kind, id) ? th : `🔒 ${th} · ${avatarItemPrice(kind, id) ?? 0} ${t.me.avatarPoints}`;

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
      <p className="text-sm">
        <span className="font-semibold">{t.me.avatarBalance}:</span> {shop.balance}{' '}
        {t.me.avatarPoints} <span className="text-xs text-slate-500">· {t.me.avatarEarnHint}</span>
      </p>
      <div className="h-[360px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
        <Suspense fallback={<p className="p-4 text-sm">{t.loading}</p>}>
          <AvatarViewer
            body={choice.body}
            hair={preview?.kind === 'hair' ? (preview.id as HairId) : choice.hair}
            outfit={preview?.kind === 'outfit' ? (preview.id as OutfitId) : choice.outfit}
            onSnapshot={(url, sel) => (preview ? undefined : onSnapshot(url, sel))}
          />
        </Suspense>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t.me.avatarBody}</legend>
        <div className="flex flex-wrap gap-2">
          {BODIES.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={choice.body === b.id}
              onClick={() => pick({ ...choice, body: b.id })}
              className={btn(choice.body === b.id)}
            >
              {b.th}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t.me.avatarHair}</legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={choice.hair === null}
            onClick={() => {
              setPreview(null);
              pick({ ...choice, hair: null });
            }}
            className={btn(choice.hair === null)}
          >
            {t.me.avatarNoHair}
          </button>
          {HAIRS.map((h) => (
            <button
              key={h.id}
              type="button"
              aria-pressed={
                preview ? preview.kind === 'hair' && preview.id === h.id : choice.hair === h.id
              }
              onClick={() => choose('hair', h.id)}
              className={btn(
                preview ? preview.kind === 'hair' && preview.id === h.id : choice.hair === h.id,
              )}
            >
              {label(h.th, 'hair', h.id)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t.me.avatarOutfit}</legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={choice.outfit === null}
            onClick={() => {
              setPreview(null);
              pick({ ...choice, outfit: null });
            }}
            className={btn(choice.outfit === null)}
          >
            {t.me.avatarNoOutfit}
          </button>
          {OUTFITS.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={
                preview ? preview.kind === 'outfit' && preview.id === o.id : choice.outfit === o.id
              }
              onClick={() => choose('outfit', o.id)}
              className={btn(
                preview ? preview.kind === 'outfit' && preview.id === o.id : choice.outfit === o.id,
              )}
            >
              {label(o.th, 'outfit', o.id)}
            </button>
          ))}
        </div>
      </fieldset>

      {preview && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
          <span className="flex-1">{t.me.avatarPreviewing}</span>
          <button
            type="button"
            onClick={() => void unlock(preview.kind, preview.id)}
            disabled={shop.balance < (avatarItemPrice(preview.kind, preview.id) ?? 0)}
            className="rounded-full bg-brand-600 px-3 py-1.5 font-medium text-white disabled:opacity-50"
          >
            {t.me.avatarUnlock} ({avatarItemPrice(preview.kind, preview.id)} {t.me.avatarPoints})
          </button>
        </div>
      )}

      <NameForm
        key={game?.profile ? 'set' : 'new'}
        initialName={game?.profile?.displayName ?? ''}
        initialHonorific={game?.profile?.honorific ?? 'master'}
        onSave={saveName}
        btn={btn}
      />

      <p
        role="status"
        aria-live="polite"
        className="min-h-[1rem] text-xs text-slate-600 dark:text-slate-300"
      >
        {notice || statusText}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t.me.avatarNote}</p>
    </div>
  );
}

/** ตั้งชื่อที่ Dobby ใช้เรียกผู้ใช้ (ผู้ใช้ใหม่บันทึกครั้งแรกได้แต้มต้อนรับ) */
function NameForm(p: {
  initialName: string;
  initialHonorific: Honorific;
  onSave: (name: string, honorific: Honorific) => Promise<void>;
  btn: (on: boolean) => string;
}) {
  const [name, setName] = useState(p.initialName);
  const [hon, setHon] = useState<Honorific>(p.initialHonorific);
  const [busy, setBusy] = useState(false);
  const opts: [Honorific, string][] = [
    ['name', t.me.nameName],
    ['master', t.me.nameMaster],
    ['both', t.me.nameBoth],
  ];
  const needName = hon !== 'master' && !name.trim();
  return (
    <form
      className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await p.onSave(name.trim(), hon);
        setBusy(false);
      }}
    >
      <h3 className="text-sm font-semibold">{t.me.nameTitle}</h3>
      <label className="block text-sm">
        {t.me.nameLabel}
        <input
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.me.namePlaceholder}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
        />
      </label>
      <fieldset>
        <legend className="mb-1 text-sm">{t.me.nameHonorific}</legend>
        <div className="flex flex-wrap gap-2">
          {opts.map(([id, th]) => (
            <button
              key={id}
              type="button"
              aria-pressed={hon === id}
              onClick={() => setHon(id)}
              className={p.btn(hon === id)}
            >
              {th}
            </button>
          ))}
        </div>
      </fieldset>
      <button type="submit" disabled={busy || needName} className={p.btn(true)}>
        {t.me.nameSave}
      </button>
    </form>
  );
}

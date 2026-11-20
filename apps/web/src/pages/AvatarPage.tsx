import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
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
      .then((a) => {
        if (!alive.current) return;
        if (a) {
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

  const btn = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-sm disabled:opacity-50 ${on ? 'bg-brand-600 font-medium text-white' : 'border border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'}`;

  if (!choice) return <p role="status">{t.loading}</p>;

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
      <div className="h-[360px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
        <Suspense fallback={<p className="p-4 text-sm">{t.loading}</p>}>
          <AvatarViewer
            body={choice.body}
            hair={choice.hair}
            outfit={choice.outfit}
            onSnapshot={onSnapshot}
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
            onClick={() => pick({ ...choice, hair: null })}
            className={btn(choice.hair === null)}
          >
            {t.me.avatarNoHair}
          </button>
          {HAIRS.map((h) => (
            <button
              key={h.id}
              type="button"
              aria-pressed={choice.hair === h.id}
              onClick={() => pick({ ...choice, hair: h.id })}
              className={btn(choice.hair === h.id)}
            >
              {h.th}
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
            onClick={() => pick({ ...choice, outfit: null })}
            className={btn(choice.outfit === null)}
          >
            {t.me.avatarNoOutfit}
          </button>
          {OUTFITS.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={choice.outfit === o.id}
              onClick={() => pick({ ...choice, outfit: o.id })}
              className={btn(choice.outfit === o.id)}
            >
              {o.th}
            </button>
          ))}
        </div>
      </fieldset>

      <p
        role="status"
        aria-live="polite"
        className="min-h-[1rem] text-xs text-slate-600 dark:text-slate-300"
      >
        {statusText}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t.me.avatarNote}</p>
    </div>
  );
}

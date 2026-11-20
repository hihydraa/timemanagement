import { lazy, Suspense, useState } from 'react';
import { BODIES, HAIRS, OUTFITS, type BodyId, type HairId, type OutfitId } from '../lib/avatarModels';
import { saveAvatarSnapshot } from '../lib/avatarSnapshot';
import { t } from '../lib/i18n';

const AvatarViewer = lazy(() => import('../components/avatar/AvatarViewer'));

const KEY = 'dobby.avatar.choice';
type Choice = { body: BodyId; hair: HairId | null; outfit: OutfitId | null };
const DEFAULT: Choice = { body: 'female', hair: 'bob', outfit: null };

/** เลือกค่าที่บันทึกไว้ในเครื่องนี้ (ไม่ผ่านเซิร์ฟเวอร์) ถ้าไม่มีหรืออ่านไม่ได้ใช้ค่าเริ่มต้น */
function readChoice(): Choice {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Choice> | null;
    // ตรวจทุกค่ากับแคตาล็อกปัจจุบัน (ค่าเก่าที่ไม่มีแล้วจะถูกทิ้ง)
    if (v && BODIES.some((b) => b.id === v.body)) {
      return {
        body: v.body!,
        hair: HAIRS.some((h) => h.id === v.hair) ? (v.hair as HairId) : null,
        outfit: OUTFITS.some((o) => o.id === v.outfit) ? (v.outfit as OutfitId) : null,
      };
    }
  } catch {
    /* ไม่มี storage */
  }
  return DEFAULT;
}

/** แท็บ "อวตาร" ในหน้าฉัน: เลือกตัวละครและทรงผมแล้วดูแบบ 3D */
export default function AvatarPage() {
  const [choice, setChoice] = useState<Choice>(readChoice);
  const save = (next: Choice) => {
    setChoice(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ไม่มี storage ก็ใช้ได้ แค่ไม่จำค่า */
    }
  };
  const btn = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-sm disabled:opacity-50 ${on ? 'bg-brand-600 font-medium text-white' : 'border border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'}`;

  return (
    <div className="space-y-4">
      <div className="h-[360px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
        <Suspense fallback={<p className="p-4 text-sm">{t.loading}</p>}>
          <AvatarViewer
            body={choice.body}
            hair={choice.hair}
            outfit={choice.outfit}
            onSnapshot={saveAvatarSnapshot}
          />
        </Suspense>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t.me.avatarBody}</legend>
        {choice.outfit !== null && (
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{t.me.avatarOutfitNoHair}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {BODIES.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={choice.outfit !== null}
              aria-pressed={choice.body === b.id}
              onClick={() => save({ ...choice, body: b.id })}
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
            disabled={choice.outfit !== null}
            aria-pressed={choice.hair === null}
            onClick={() => save({ ...choice, hair: null })}
            className={btn(choice.hair === null)}
          >
            {t.me.avatarNoHair}
          </button>
          {HAIRS.map((h) => (
            <button
              key={h.id}
              type="button"
              disabled={choice.outfit !== null}
              aria-pressed={choice.hair === h.id}
              onClick={() => save({ ...choice, hair: h.id })}
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
            onClick={() => save({ ...choice, outfit: null })}
            className={btn(choice.outfit === null)}
          >
            {t.me.avatarNoOutfit}
          </button>
          {OUTFITS.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={choice.outfit === o.id}
              onClick={() => save({ ...choice, outfit: o.id, hair: null })}
              className={btn(choice.outfit === o.id)}
            >
              {o.th}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-slate-500 dark:text-slate-400">{t.me.avatarNote}</p>
    </div>
  );
}

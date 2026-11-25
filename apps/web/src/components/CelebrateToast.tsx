import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/appContext';
import { isCornerVisible, useAvatarLook } from '../lib/avatarLook';
import { useDobbySpeech } from '../lib/celebrate';
import { toDayState, useDobbyData } from '../lib/dobbyContext';
import { markGreeted, shouldGreet } from '../lib/dobbyPrefs';
import { t } from '../lib/i18n';
import { greetingKind, greetingN, moodOf, sayDobby } from '../../../../src/lib/dobbyVoice';
import Confetti from './Confetti';
import Mascot from './Mascot';

/**
 * Dobby ประจำมุมขวาล่าง: อยู่ค้างตลอดทุกหน้า และ "เข้าใจสถานการณ์"
 * - เพิ่ม/ทำงานเสร็จ: เปลี่ยนท่า + พูดฉลองตามเหตุการณ์จริง + กระดาษสีกระจาย
 * - เปิดแอปครั้งแรกของช่วง: ทักทายตามเวลา/งานค้าง/วันหยุด (ปิดได้ในตั้งค่า Dobby)
 * - ท่าปกติเปลี่ยนตามอารมณ์ (ดึก/วันหยุด = พัก, งานค้าง = กังวล, เช้า = ตื่น)
 * - กดที่ Dobby: เมนูลัด (สรุปวันนี้ / เพิ่มงาน / ตั้งค่า)
 */
export default function CelebrateToast() {
  const { route, call, dobby, tone, game, newTask, openDobby } = useApp();
  const look = useAvatarLook();
  const data = useDobbyData();
  const { msg, tick, celebrating, say } = useDobbySpeech({ you: call, dobby, tone });
  const [menu, setMenu] = useState(false);
  const withAvatar = isCornerVisible(route, look);
  const noProfile = game !== null && !game.profile;
  const state = data ? toDayState(data, noProfile) : null;
  const mood = state ? moodOf(state) : 'hello';

  // ทักทายครั้งเดียวต่อการเปิดแอป เมื่อรู้สถานการณ์แล้ว (และเว้นระยะจากครั้งก่อน)
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current || !state || game === null) return;
    greeted.current = true;
    if (!shouldGreet(noProfile)) return;
    const kind = greetingKind(state);
    const text = sayDobby(kind, { you: call, dobby, n: greetingN(kind, state) }, tone);
    const id = window.setTimeout(() => {
      say(text, 6000);
      markGreeted(noProfile);
    }, 1200);
    return () => {
      window.clearTimeout(id);
      greeted.current = false;
    };
    // ทักทายแค่เมื่อข้อมูลวันนี้พร้อมครั้งแรก
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state !== null, game !== null]);

  const summary = () => {
    setMenu(false);
    if (!state) return say(sayDobby('greet_afternoon', { you: call, dobby, n: 0 }, tone));
    const kind = greetingKind({ ...state, noProfile: false });
    say(sayDobby(kind, { you: call, dobby, n: greetingN(kind, state) }, tone), 6000);
  };

  const pos = withAvatar
    ? 'bottom-24 right-[7rem] md:bottom-4 md:right-40'
    : 'bottom-24 right-3 md:bottom-4 md:right-4';
  const item =
    'block w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:bg-slate-700';
  return (
    <div className={`fixed z-30 ${pos}`}>
      {msg && !menu && (
        <p
          role="status"
          aria-live="polite"
          className="glow-success pointer-events-none absolute bottom-full right-0 mb-2 w-max max-w-[14rem] animate-pop rounded-2xl rounded-br-sm border-2 border-gold-500 bg-white px-4 py-2.5 text-base font-semibold leading-snug text-brand-700 shadow-soft dark:bg-slate-800 dark:text-brand-300"
        >
          {msg}
        </p>
      )}
      {menu && (
        <div
          role="menu"
          className="absolute bottom-full right-0 mb-2 w-48 rounded-2xl border border-slate-200 bg-white p-1 shadow-soft dark:border-slate-700 dark:bg-slate-800"
        >
          <button type="button" role="menuitem" className={item} onClick={summary}>
            {t.dobbyMenu.summary}
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setMenu(false);
              newTask();
            }}
          >
            {t.dobbyMenu.add}
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setMenu(false);
              openDobby();
            }}
          >
            {t.dobbyMenu.settings}
          </button>
        </div>
      )}
      {tick > 0 && celebrating && <Confetti key={tick} count={22} radius={110} />}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-label={t.dobbyMenu.open(dobby)}
        onClick={() => setMenu((m) => !m)}
        onKeyDown={(e) => e.key === 'Escape' && setMenu(false)}
        className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        <Mascot
          pose={celebrating ? 'done' : mood}
          height={withAvatar ? 72 : 88}
          className={`drop-shadow-lg ${celebrating ? 'animate-pop' : ''}`}
        />
      </button>
    </div>
  );
}

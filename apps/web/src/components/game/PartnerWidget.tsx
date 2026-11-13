import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../lib/appContext';
import { getItem } from '../../lib/game';
import { t } from '../../lib/i18n';
import { usePartnerHidden } from '../../lib/widget';
import Mascot from '../Mascot';
import Avatar from './Avatar';

const hour = () =>
  Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok',
    }).format(new Date()),
  );

/**
 * ตัวละครของผู้ใช้ (สวมชุดที่ซื้อไว้) + Dobby ที่มุมล่างขวา: ทักทายตอนเปิดแอป, ฉลองเมื่อทำงานเสร็จ (+แต้ม), กดเพื่อไปหน้าตัวละคร
 * ซ่อนเหลือปุ่มเล็ก ๆ ได้
 */
export default function PartnerWidget() {
  const { game, call } = useApp();
  const [hidden, setHidden] = usePartnerHidden();
  const [bubble, setBubble] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const callRef = useRef(call);
  callRef.current = call;
  const profile = game?.profile;

  const say = (text: string, ms = 4500) => {
    setBubble(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setBubble(''), ms);
  };

  // ทักทายครั้งแรกของเซสชัน
  const greeted = useRef(false);
  useEffect(() => {
    if (!profile || greeted.current) return;
    greeted.current = true;
    const g =
      t.cockpit.greet[hour() < 5 ? 3 : hour() < 12 ? 0 : hour() < 17 ? 1 : hour() < 21 ? 2 : 3];
    say(`${g} ${callRef.current ?? ''}`.trim(), 5500);
  }, [profile]);

  useEffect(() => {
    let last = '';
    const onCelebrate = () => {
      const c = callRef.current;
      const pool = c ? t.mascot.celebrateNamed : t.mascot.celebrate;
      last = (pool[Math.floor(Math.random() * pool.length)] ?? '').replace('{name}', c ?? '');
      say(last);
    };
    const onPoints = (e: Event) => {
      const n = (e as CustomEvent<{ points: number }>).detail?.points ?? 0;
      if (n > 0) say(`${last ? `${last} ` : ''}🪙 ${t.game.plus.replace('{n}', String(n))}`);
      last = '';
    };
    window.addEventListener('dobby:celebrate', onCelebrate);
    window.addEventListener('dobby:points', onPoints);
    return () => {
      window.removeEventListener('dobby:celebrate', onCelebrate);
      window.removeEventListener('dobby:points', onPoints);
      window.clearTimeout(timer.current);
    };
  }, []);

  if (!profile) return null;
  const worn = (game?.inventory ?? [])
    .filter((i) => i.equipped)
    .map((i) => getItem(i.itemId))
    .filter((x) => !!x);
  const pet = worn.find((x) => x!.slot === 'companion');
  const clothes = worn.filter((x) => x!.slot !== 'companion').map((x) => x!.id);

  if (hidden)
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        aria-label={t.game.partnerShow}
        title={t.game.partnerShow}
        className="fixed bottom-24 right-3 z-40 h-12 w-12 overflow-hidden rounded-full border-2 border-brand-600 bg-[#fcf5e6] shadow-lg md:bottom-4 md:right-4"
      >
        <img
          src={`/game/cut/characters/${profile.characterId}.webp`}
          alt=""
          className="h-full w-full object-cover object-top"
        />
      </button>
    );

  return (
    <div className="pointer-events-none fixed bottom-24 right-2 z-40 flex items-end md:bottom-3 md:right-4">
      {bubble && (
        <p
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute bottom-full right-4 mb-1 max-w-[14rem] animate-pop rounded-2xl rounded-br-sm border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-800 shadow-soft dark:border-brand-700 dark:bg-slate-800 dark:text-brand-200"
        >
          {bubble}
        </p>
      )}
      <a
        href="#/me/game"
        aria-label={t.game.title}
        className="pointer-events-auto flex items-end rounded-2xl px-1 pb-1 pt-1 drop-shadow-[0_4px_8px_rgba(60,45,20,0.25)] transition-transform hover:-translate-y-0.5"
      >
        <Avatar
          characterId={profile.characterId}
          worn={clothes}
          companionId={pet?.id}
          height={128}
        />
        <Mascot pose="hello" height={72} className="-ml-3" />
      </a>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label={t.game.partnerHide}
        className="pointer-events-auto absolute -right-1 -top-1 h-6 w-6 rounded-full border border-slate-300 bg-white text-xs leading-none text-slate-700 shadow hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
      >
        ×
      </button>
    </div>
  );
}

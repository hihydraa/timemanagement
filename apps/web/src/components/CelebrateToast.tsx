import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/appContext';
import { usePartnerHidden } from '../lib/widget';
import { t } from '../lib/i18n';
import Mascot from './Mascot';

export const CELEBRATE_EVENT = 'dobby:celebrate';
const MESSAGES = t.mascot.celebrate;
const NAMED = t.mascot.celebrateNamed;

/** ป๊อปอัปมาสคอตฉลองเมื่อทำงานเสร็จ (รับ event จาก api.completeTask/updateTask) แสดง ~2.5 วินาที */
export default function CelebrateToast() {
  const { call, game } = useApp();
  const [partnerHidden] = usePartnerHidden();
  const widgetActive = !!game?.profile && !partnerHidden; // ตัวละครมุมล่างขวาฉลองแทน
  const callRef = useRef(call);
  callRef.current = call;
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const on = () => {
      const c = callRef.current;
      const pool = c ? NAMED : MESSAGES;
      const m = pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? '';
      setMsg(c ? m.replace('{name}', c) : m);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 2600);
    };
    window.addEventListener(CELEBRATE_EVENT, on);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, on);
      window.clearTimeout(timer);
    };
  }, []);
  if (!msg || widgetActive) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex animate-pop items-end gap-2 rounded-2xl border border-brand-200 bg-white px-4 py-3 shadow-soft dark:border-brand-700 dark:bg-slate-800"
    >
      <Mascot pose="done" height={84} className="-mb-1 -ml-1" />
      <p className="pb-2 font-semibold text-brand-700 dark:text-brand-300">{msg}</p>
    </div>
  );
}

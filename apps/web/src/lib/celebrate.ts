import { useEffect, useRef, useState } from 'react';
import { t } from './i18n';

export const CELEBRATE_EVENT = 'dobby:celebrate';

export function pickCelebrateMessage(call: string | null): string {
  const pool = call ? t.mascot.celebrateNamed : t.mascot.celebrate;
  const m = pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? '';
  return call ? m.replace('{name}', call) : m;
}

/** ข้อความฉลองเมื่อทำงานเสร็จ (รับ event จาก api.completeTask/updateTask) แสดง ~2.6 วินาทีแล้วเป็น null */
export function useCelebrateMessage(call: string | null): string | null {
  const callRef = useRef(call);
  callRef.current = call;
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const on = () => {
      setMsg(pickCelebrateMessage(callRef.current));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 2600);
    };
    window.addEventListener(CELEBRATE_EVENT, on);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, on);
      window.clearTimeout(timer);
    };
  }, []);
  return msg;
}

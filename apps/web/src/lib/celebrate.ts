import { useEffect, useRef, useState } from 'react';
import { t } from './i18n';

export const CELEBRATE_EVENT = 'dobby:celebrate';

export function pickCelebrateMessage(call: string | null): string {
  const pool = call ? t.mascot.celebrateNamed : t.mascot.celebrate;
  const m = pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? '';
  return call ? m.replace('{name}', call) : m;
}

/** เวลาที่กล่องคำพูดฉลองค้างอยู่ (ms) — เดิม 2.6 วินาทีสั้นเกินไปจนอ่านไม่ทัน */
export const CELEBRATE_MS = 4500;

/**
 * ข้อความฉลองเมื่อเพิ่ม/ทำงานเสร็จ (รับ event จาก api) ค้างอยู่ CELEBRATE_MS แล้วเป็น null
 * tick นับจำนวนครั้งที่ฉลอง (ใช้เป็น key ให้เอฟเฟกต์เล่นใหม่ทุกครั้ง)
 */
export function useCelebrate(call: string | null): { msg: string | null; tick: number } {
  const callRef = useRef(call);
  callRef.current = call;
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let timer: number | undefined;
    const on = () => {
      setMsg(pickCelebrateMessage(callRef.current));
      setTick((n) => n + 1);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), CELEBRATE_MS);
    };
    window.addEventListener(CELEBRATE_EVENT, on);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, on);
      window.clearTimeout(timer);
    };
  }, []);
  return { msg, tick };
}

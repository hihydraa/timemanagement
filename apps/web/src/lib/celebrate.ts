import { useCallback, useEffect, useRef, useState } from 'react';
import { getDobbyData } from './dobbyContext';
import { celebrateText, type CelebrateDetail, type DobbyVoiceOpts } from './dobbyCelebrate';

export type { CelebrateDetail, DobbyVoiceOpts } from './dobbyCelebrate';

export const CELEBRATE_EVENT = 'dobby:celebrate';

/** เวลาที่กล่องคำพูดค้างอยู่ (ms) — เดิม 2.6 วินาทีสั้นเกินไปจนอ่านไม่ทัน */
export const CELEBRATE_MS = 4500;

/**
 * คำพูดของ Dobby: ข้อความฉลองตามเหตุการณ์จริง (เพิ่ม/ทำงานเสร็จ) + say() สำหรับทักทาย/สรุป
 * ค้างอยู่ CELEBRATE_MS แล้วเป็น null; tick นับจำนวนครั้งที่พูด (ใช้เป็น key ให้เอฟเฟกต์เล่นใหม่)
 */
export function useDobbySpeech(v: DobbyVoiceOpts): {
  msg: string | null;
  tick: number;
  celebrating: boolean;
  say: (text: string, ms?: number) => void;
} {
  const vRef = useRef(v);
  vRef.current = v;
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const cTimer = useRef<number | undefined>(undefined);

  const say = useCallback((text: string, ms = CELEBRATE_MS) => {
    setMsg(text);
    setTick((n) => n + 1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), ms);
  }, []);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<CelebrateDetail | undefined>).detail;
      say(celebrateText(d, vRef.current, getDobbyData()));
      setCelebrating(true);
      window.clearTimeout(cTimer.current);
      cTimer.current = window.setTimeout(() => setCelebrating(false), CELEBRATE_MS);
    };
    window.addEventListener(CELEBRATE_EVENT, on);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, on);
      window.clearTimeout(timer.current);
      window.clearTimeout(cTimer.current);
    };
  }, [say]);

  return { msg, tick, celebrating, say };
}

/** ใช้กับตัวละครของผู้ใช้ที่มุมจอ: รู้แค่ว่ากำลังมีการฉลองไหม (คนพูดคือ Dobby) */
export function useCelebrating(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let t: number | undefined;
    const h = () => {
      setOn(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setOn(false), CELEBRATE_MS);
    };
    window.addEventListener(CELEBRATE_EVENT, h);
    return () => {
      window.removeEventListener(CELEBRATE_EVENT, h);
      window.clearTimeout(t);
    };
  }, []);
  return on;
}

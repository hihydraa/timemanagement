import { useCallback, useEffect, useRef, useState } from 'react';
import {
  completeKind,
  sayDobby,
  type ToneId,
  type VoiceCtx,
  type VoiceKind,
} from '../../../../src/lib/dobbyVoice';
import { getDobbyData } from './dobbyContext';

export const CELEBRATE_EVENT = 'dobby:celebrate';

/** รายละเอียดของเหตุการณ์ฉลอง (api.ts ส่งมากับ event): เพิ่มงาน / ทำงานเสร็จ (พร้อมความสำคัญ) / เหตุการณ์อื่นพร้อมข้อความสำเร็จรูป */
export type CelebrateDetail =
  | { kind: 'create' }
  | { kind: 'complete'; importance: number }
  | { kind: 'voice'; voice: VoiceKind; ctx?: VoiceCtx };

/** เวลาที่กล่องคำพูดค้างอยู่ (ms) — เดิม 2.6 วินาทีสั้นเกินไปจนอ่านไม่ทัน */
export const CELEBRATE_MS = 4500;

export interface DobbyVoiceOpts {
  you: string | null;
  dobby: string;
  tone: ToneId;
}

/** เลือกข้อความฉลองจากเหตุการณ์ + สถานการณ์ของวัน (ฟังก์ชันบริสุทธิ์ ทดสอบได้) */
export function celebrateText(
  d: CelebrateDetail | undefined,
  v: DobbyVoiceOpts,
  data: { open: number; doneToday: number } | null,
  pick: () => number = Math.random,
): string {
  const ctx = { you: v.you, dobby: v.dobby };
  if (d?.kind === 'voice') return sayDobby(d.voice, { ...ctx, ...d.ctx }, v.tone, pick);
  if (d?.kind === 'create') return sayDobby('created', ctx, v.tone, pick);
  // ทำเสร็จ: ประมาณจากสถานการณ์ล่าสุดว่าหลังชิ้นนี้เหลือเท่าไร (ข้อมูลหน้าวันนี้ยังไม่รีเฟรช)
  const openAfter = Math.max(0, (data?.open ?? 1) - 1);
  const doneToday = (data?.doneToday ?? 0) + 1;
  const kind = completeKind({
    importance: d?.kind === 'complete' ? d.importance : 2,
    openAfter,
    doneToday,
  });
  return sayDobby(kind, ctx, v.tone, pick);
}

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

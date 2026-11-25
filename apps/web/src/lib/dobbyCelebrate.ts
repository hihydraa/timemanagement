import {
  completeKind,
  sayDobby,
  type ToneId,
  type VoiceCtx,
  type VoiceKind,
} from '../../../../src/lib/dobbyVoice';

/** รายละเอียดของเหตุการณ์ฉลอง (api.ts ส่งมากับ event): เพิ่มงาน / ทำงานเสร็จ (พร้อมความสำคัญ) / เหตุการณ์อื่นพร้อมข้อความสำเร็จรูป */
export type CelebrateDetail =
  | { kind: 'create' }
  | { kind: 'complete'; importance: number }
  | { kind: 'voice'; voice: VoiceKind; ctx?: VoiceCtx };

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

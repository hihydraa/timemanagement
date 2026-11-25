/**
 * "เสียง" ของ Dobby (ใช้ร่วมกันเว็บ/เซิร์ฟเวอร์): ข้อความตามสถานการณ์ในโทนที่ผู้ใช้เลือก
 * ฟังก์ชันทุกตัวเป็นฟังก์ชันบริสุทธิ์ (รับตัวสุ่ม `pick` ให้ทดสอบได้) — ไม่แตะเวลา/เครือข่าย
 *
 * โทนที่มีตอนนี้: playful (ขี้เล่น น่ารัก) — เพิ่มโทนใหม่ได้โดยเติมใน TONES และ POOLS
 */
export const TONES = [{ id: 'playful', th: 'ขี้เล่น น่ารัก' }] as const;
export type ToneId = (typeof TONES)[number]['id'];
export const TONE_IDS = TONES.map((t) => t.id) as [ToneId, ...ToneId[]];
export const DEFAULT_TONE: ToneId = 'playful';
export const DEFAULT_DOBBY_NAME = 'ดอบบี้';

export const isTone = (s: string): s is ToneId => (TONE_IDS as string[]).includes(s);
export const dobbyNameOf = (n: string | null | undefined): string =>
  n?.trim() || DEFAULT_DOBBY_NAME;

export type VoiceKind =
  | 'complete'
  | 'complete_important'
  | 'complete_first'
  | 'all_clear'
  | 'streak'
  | 'created'
  | 'greet_morning'
  | 'greet_afternoon'
  | 'greet_evening'
  | 'greet_night'
  | 'overdue'
  | 'dayoff'
  | 'no_profile'
  | 'level_up'
  | 'quest_done';

/** ตัวแปรในเทมเพลต: {you} ชื่อที่เรียกผู้ใช้ {dobby} ชื่อ Dobby {n} ตัวเลขของสถานการณ์ {lv} เลเวล */
export interface VoiceCtx {
  /** ชื่อที่เรียกผู้ใช้ (null = ยังไม่ได้ตั้ง ใช้ "คุณ") */
  you?: string | null;
  dobby?: string | null;
  n?: number;
  level?: number;
}

type Pool = Record<VoiceKind, readonly string[]>;
const POOLS: Record<ToneId, Pool> = {
  playful: {
    complete: [
      'เย้! {you} เก่งที่สุดเลย ✨',
      'ติ๊กแล้วจ้า~ {dobby}ดีใจจนหูกระดิก',
      'อีกหนึ่งงานเรียบร้อย! {dobby}ปรบมือรัว ๆ 👏',
      'ฮึบ ๆ เสร็จแล้ว! {you} สุดยอดไปเลย',
      'ว้าว ไวมาก! {dobby}ตามไม่ทันแล้วนะเนี่ย 💨',
    ],
    complete_important: [
      'งานสำคัญเสร็จแล้ว! {dobby}ขอกอดหน่อยนะ 🤗',
      'โอ้โห งานใหญ่ยังไม่รอด {you} ไปได้! 🌟',
      'งานสำคัญล้มแล้ว! {dobby}ตัวสั่นด้วยความภูมิใจ 🥹',
    ],
    complete_first: [
      'งานแรกของวันเสร็จแล้ว! วอร์มอัพผ่านฉลุย 🔥',
      'เริ่มต้นได้สวยมาก {you}! งานต่อไปรออยู่นะ 😆',
    ],
    all_clear: [
      'เคลียร์หมดแล้ว! {you} พักได้เต็มที่ {dobby}ชงชาให้ 🍵',
      'วันนี้ไม่เหลืองานค้างเลย! {dobby}เต้นดีใจรอบห้อง 💃',
      'ครบทุกงาน! {you} คือที่หนึ่งของ{dobby}เลย 🏆',
    ],
    streak: [
      'ทำงานเสร็จติดต่อกัน {n} วันแล้วนะ! {dobby}ตื่นเต้นสุด ๆ 🔥',
      '{n} วันติด! อย่าให้ไฟดับนะ {you} 🔥',
    ],
    created: [
      'จดแล้วจ้า {dobby}จำให้เอง 📝',
      'เพิ่มงานใหม่แล้ว! {you} เตรียมตัวลุยนะ',
      'รับทราบ~ {dobby}เก็บไว้ในกระเป๋าให้แล้ว 🎒',
    ],
    greet_morning: [
      'อรุณสวัสดิ์ {you}! วันนี้มี {n} งาน ไปลุยกัน ☀️',
      'ตื่นแล้วเหรอ~ {dobby}ชงชาอุ่น ๆ รอ วันนี้มี {n} งานนะ 🍵',
    ],
    greet_afternoon: [
      'บ่ายแล้วนะ {you} เหลืออีก {n} งาน สู้ ๆ จ้า 💪',
      'พักจิบน้ำสักแก้วไหม? วันนี้เหลือ {n} งาน {dobby}เป็นกำลังใจให้ 🥤',
    ],
    greet_evening: [
      'ตอนเย็นแล้ว {you} วันนี้เหลือ {n} งาน ค่อย ๆ ทำนะ 🌆',
      'ใกล้ค่ำแล้ว {dobby}เตรียมผ้าห่มให้ รีบเคลียร์อีก {n} งานก็พอนะ 🧣',
    ],
    greet_night: [
      'ดึกแล้วนะ {you} พักผ่อนได้แล้ว งานที่เหลือพรุ่งนี้ค่อยว่ากัน 🌙',
      '{dobby}ง่วงแล้ว… {you} นอนเถอะนะ ฝันดี 😴',
    ],
    overdue: [
      'มีงานเลยกำหนดอยู่ {n} งานนะ {dobby}ช่วยจัดให้ไหม? 🥺',
      'มี {n} งานที่ค้างอยู่ ไม่เป็นไร ค่อย ๆ เคลียร์ไปด้วยกันนะ {you} 🫶',
    ],
    dayoff: [
      'วันนี้วันหยุดนี่นา พักผ่อนให้เต็มที่นะ {you} 🏖',
      'วันลาพักก็คือวันชาร์จพลัง! {dobby}ไม่กวนนะ 🔋',
    ],
    no_profile: [
      'ตั้งชื่อให้{dobby}หน่อยสิ แล้วบอกด้วยว่าจะให้เรียกคุณว่าอะไร 🥰',
      'อยากให้{dobby}เรียกคุณว่าอะไรดี? กดที่{dobby}แล้วเลือกตั้งค่าได้เลย',
    ],
    level_up: [
      'เลเวลอัป! {you} ถึงเลเวล {level} แล้ว 🎉',
      'ว้าว เลเวล {level}! {dobby}ปลื้มใจจนน้ำตาซึม 🥹',
    ],
    quest_done: [
      'ภารกิจสำเร็จ! รับรางวัลได้เลยจ้า 🎁',
      'ผ่านภารกิจแล้ว! {dobby}เตรียมของรางวัลไว้ให้ 🎁',
    ],
  },
};

const fill = (tpl: string, c: VoiceCtx): string => {
  const dobby = dobbyNameOf(c.dobby);
  const you = c.you?.trim() || 'คุณ';
  return tpl
    .replaceAll('{you}', you)
    .replaceAll('{dobby}', dobby)
    .replaceAll('{n}', String(c.n ?? 0))
    .replaceAll('{level}', String(c.level ?? 1));
};

/** ข้อความของ Dobby ตามสถานการณ์ (pick: ตัวสุ่ม 0 ≤ x < 1; ทดสอบส่งค่าคงที่) */
export function sayDobby(
  kind: VoiceKind,
  ctx: VoiceCtx = {},
  tone: ToneId = DEFAULT_TONE,
  pick: () => number = Math.random,
): string {
  const pool = (POOLS[tone] ?? POOLS[DEFAULT_TONE])[kind];
  const t = pool[Math.min(pool.length - 1, Math.floor(pick() * pool.length))] ?? pool[0]!;
  return fill(t, ctx);
}

/** จำนวนข้อความต่อสถานการณ์ (ใช้ทดสอบว่าทุกโทนมีครบทุกสถานการณ์) */
export const poolSize = (kind: VoiceKind, tone: ToneId = DEFAULT_TONE): number =>
  POOLS[tone][kind].length;

// ---------------------------------------------------------------- เลือกข้อความตามสถานการณ์
/** ภาพรวมของวันนี้ที่ Dobby ใช้ตัดสินใจ */
export interface DayState {
  /** ชั่วโมงเวลาไทย 0–23 */
  hour: number;
  /** งานที่ยังไม่เสร็จของวันนี้ (วันนี้ + เดดไลน์วันนี้) */
  open: number;
  /** งานเลยกำหนดที่ยังค้าง */
  overdue: number;
  doneToday: number;
  streak: number;
  dayOff: boolean;
  /** ผู้ใช้ยังไม่ได้ตั้งค่า Dobby (ยังไม่มีโปรไฟล์) */
  noProfile: boolean;
}

export type Mood = 'morning' | 'rest' | 'deadline' | 'hello' | 'done';

/** ท่าของ Dobby ตามเวลาและสถานะ: ดึก/วันหยุด = พัก, ค้างเยอะ = กังวล, เช้า = ตื่น */
export function moodOf(s: DayState): Mood {
  if (s.dayOff || s.hour >= 22 || s.hour < 5) return 'rest';
  if (s.overdue > 0) return 'deadline';
  if (s.open === 0 && s.doneToday > 0) return 'done';
  if (s.hour < 11) return 'morning';
  return 'hello';
}

/** คำทักทายเมื่อเปิดแอป: เลือกเรื่องที่สำคัญที่สุดตอนนี้ (ลำดับ: ยังไม่ตั้งค่า > วันหยุด > ค้าง > สตรีค > ตามช่วงเวลา) */
export function greetingKind(s: DayState): VoiceKind {
  if (s.noProfile) return 'no_profile';
  if (s.dayOff) return 'dayoff';
  if (s.overdue > 0) return 'overdue';
  if (s.open === 0 && s.doneToday > 0) return 'all_clear';
  if (s.streak >= 3 && s.hour < 12) return 'streak';
  if (s.hour >= 22 || s.hour < 5) return 'greet_night';
  if (s.hour < 12) return 'greet_morning';
  if (s.hour < 17) return 'greet_afternoon';
  return 'greet_evening';
}

/** ตัวเลขที่ใช้เติม {n} ของคำทักทายแต่ละแบบ */
export function greetingN(kind: VoiceKind, s: DayState): number {
  return kind === 'overdue' ? s.overdue : kind === 'streak' ? s.streak : s.open;
}

/** ข้อความฉลองหลังทำงานเสร็จ: งานสุดท้ายของวัน > งานสำคัญ > งานแรกของวัน > ทั่วไป */
export function completeKind(o: {
  importance: number;
  /** จำนวนงานที่เหลือของวันนี้หลังทำชิ้นนี้ */
  openAfter: number;
  /** จำนวนงานที่เสร็จวันนี้ รวมชิ้นนี้ */
  doneToday: number;
}): VoiceKind {
  if (o.openAfter <= 0 && o.doneToday > 1) return 'all_clear';
  if (o.importance >= 3) return 'complete_important';
  if (o.doneToday === 1) return 'complete_first';
  return 'complete';
}

/**
 * เลเวล ภารกิจรายวัน และตรารางวัล (ใช้ร่วมเว็บ/เซิร์ฟเวอร์ — ฟังก์ชันบริสุทธิ์)
 * ทุกอย่างคำนวณจากข้อมูลที่มีอยู่ (แต้มสะสม งานที่เสร็จ สตรีค) จึงไม่ต้องมีตารางใหม่ ยกเว้นการรับรางวัลภารกิจที่บันทึกใน game_ledger
 */

// ---------------------------------------------------------------- เลเวล
/** แต้มสะสม (XP) ที่ต้องมีเพื่อถึงเลเวล L: 20·L·(L−1) → L2=40, L3=120, L4=240 … */
export const xpForLevel = (level: number): number => 20 * level * (level - 1);

export const LEVEL_TITLES: readonly { from: number; th: string }[] = [
  { from: 1, th: 'มือใหม่หัดวางแผน' },
  { from: 3, th: 'นักจัดตาราง' },
  { from: 6, th: 'ผู้คุมเวลา' },
  { from: 10, th: 'ปรมาจารย์เวลา' },
  { from: 15, th: 'จอมเวทย์แห่งเวลา' },
];

export interface LevelInfo {
  level: number;
  title: string;
  xp: number;
  /** XP ที่เริ่มเลเวลนี้ / ที่ต้องมีเพื่อเลเวลถัดไป */
  floor: number;
  next: number;
  /** ความคืบหน้าในเลเวลนี้ 0–100 */
  pct: number;
}

export function levelOf(xp: number): LevelInfo {
  const x = Math.max(0, Math.floor(xp));
  let level = 1;
  while (xpForLevel(level + 1) <= x) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const title = [...LEVEL_TITLES].reverse().find((t) => level >= t.from)!.th;
  return {
    level,
    title,
    xp: x,
    floor,
    next,
    pct: Math.round(((x - floor) / (next - floor)) * 100),
  };
}

// ---------------------------------------------------------------- ภารกิจรายวัน
export interface QuestDef {
  id: string;
  th: string;
  /** นับจากอะไร: งานที่เพิ่มวันนี้ / งานที่ทำเสร็จวันนี้ */
  counts: 'create' | 'complete';
  target: number;
  /** แต้มรางวัลเมื่อกดรับ */
  reward: number;
}

export const DAILY_QUESTS: readonly QuestDef[] = [
  { id: 'create1', th: 'จดงานใหม่ 1 งาน', counts: 'create', target: 1, reward: 3 },
  { id: 'complete3', th: 'ทำงานให้เสร็จ 3 งาน', counts: 'complete', target: 3, reward: 6 },
  { id: 'complete5', th: 'ทำงานให้เสร็จ 5 งาน', counts: 'complete', target: 5, reward: 10 },
];
export const getQuest = (id: string): QuestDef | undefined => DAILY_QUESTS.find((q) => q.id === id);

export interface QuestState extends QuestDef {
  progress: number;
  done: boolean;
  claimed: boolean;
}

export function questStates(
  counts: { create: number; complete: number },
  claimed: ReadonlySet<string>,
): QuestState[] {
  return DAILY_QUESTS.map((q) => {
    const progress = Math.min(q.target, counts[q.counts]);
    return { ...q, progress, done: progress >= q.target, claimed: claimed.has(q.id) };
  });
}

// ---------------------------------------------------------------- ตรารางวัล
export interface BadgeDef {
  id: string;
  th: string;
  hint: string;
  icon: string;
  test: (s: BadgeStats) => boolean;
}
export interface BadgeStats {
  totalDone: number;
  streak: number;
  level: number;
}

export const BADGES: readonly BadgeDef[] = [
  {
    id: 'first',
    th: 'ก้าวแรก',
    hint: 'ทำงานเสร็จครั้งแรก',
    icon: '🌱',
    test: (s) => s.totalDone >= 1,
  },
  {
    id: 'done10',
    th: 'เริ่มคล่อง',
    hint: 'ทำงานเสร็จ 10 งาน',
    icon: '⭐',
    test: (s) => s.totalDone >= 10,
  },
  {
    id: 'done50',
    th: 'ตัวจริง',
    hint: 'ทำงานเสร็จ 50 งาน',
    icon: '🏅',
    test: (s) => s.totalDone >= 50,
  },
  {
    id: 'done200',
    th: 'เครื่องจักร',
    hint: 'ทำงานเสร็จ 200 งาน',
    icon: '🏆',
    test: (s) => s.totalDone >= 200,
  },
  {
    id: 'streak3',
    th: 'ไฟติด',
    hint: 'ทำงานเสร็จติดกัน 3 วัน',
    icon: '🔥',
    test: (s) => s.streak >= 3,
  },
  {
    id: 'streak7',
    th: 'ไฟลุก',
    hint: 'ทำงานเสร็จติดกัน 7 วัน',
    icon: '🔥',
    test: (s) => s.streak >= 7,
  },
  {
    id: 'streak30',
    th: 'ไฟไม่มีดับ',
    hint: 'ทำงานเสร็จติดกัน 30 วัน',
    icon: '🌋',
    test: (s) => s.streak >= 30,
  },
  { id: 'lv5', th: 'เลเวล 5', hint: 'ถึงเลเวล 5', icon: '🎖', test: (s) => s.level >= 5 },
];

export function badgeStates(
  s: BadgeStats,
): { id: string; th: string; hint: string; icon: string; earned: boolean }[] {
  return BADGES.map(({ id, th, hint, icon, test }) => ({ id, th, hint, icon, earned: test(s) }));
}

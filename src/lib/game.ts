/**
 * เกมสะสม: ตัวละคร 6 ตัว, เครื่องแต่งกาย 10 ชิ้นต่อชุด, สัตว์ประจำตัว — แคตาล็อกคงที่ (ใช้ร่วมกันทั้งเซิร์ฟเวอร์และเว็บ)
 * ภาพอยู่ที่ apps/web/public/game/{characters,items,companions}/<id>.webp (ตัดจากแผ่นต้นฉบับใน design/game/)
 */
export type Honorific = 'name' | 'master' | 'both';
export const HONORIFICS: readonly Honorific[] = ['name', 'master', 'both'];
export const MASTER = 'นายท่าน';

export type Slot =
  | 'outer'
  | 'top'
  | 'bottom'
  | 'shoes'
  | 'neck'
  | 'tie'
  | 'head'
  | 'face'
  | 'hand'
  | 'carry'
  | 'gloves'
  | 'bag'
  | 'waist'
  | 'accessory'
  | 'companion';

export interface Character {
  id: string;
  name: string;
  th: string;
}
export const CHARACTERS: readonly Character[] = [
  { id: 'harry', name: 'Harry', th: 'แฮร์รี่' },
  { id: 'hermione', name: 'Hermione', th: 'เฮอร์ไมโอนี่' },
  { id: 'ron', name: 'Ron', th: 'รอน' },
  { id: 'dumbledore', name: 'Dumbledore', th: 'ดัมเบิลดอร์' },
  { id: 'draco', name: 'Draco', th: 'ดราโก' },
  { id: 'hagrid', name: 'Hagrid', th: 'แฮกริด' },
];

export interface Item {
  id: string;
  /** ชุดสะสมที่ชิ้นนี้อยู่ (= id ตัวละคร) */
  collection: string;
  th: string;
  slot: Slot;
  price: number;
}

/** ราคาตามระดับ: พื้นฐาน / กลาง / หายาก / สัตว์ประจำตัว */
export const PRICE = { basic: 40, mid: 60, rare: 90, pet: 400 } as const;
type Tier = keyof typeof PRICE;

// [ชื่อไทย, ช่อง, ระดับ] เรียงตามเลข 01–10 ในภาพต้นฉบับ
const RAW: Record<string, [string, Slot, Tier][]> = {
  harry: [
    ['ชุดคลุมกริฟฟินดอร์', 'outer', 'rare'],
    ['เสื้อเชิ้ตขาว', 'top', 'basic'],
    ['เสื้อกั๊กถักลายขวาง', 'top', 'mid'],
    ['เนคไทลายทาง', 'tie', 'mid'],
    ['กางเกงขาสั้นสีเทาเข้ม', 'bottom', 'basic'],
    ['รองเท้าหนังสีดำ', 'shoes', 'basic'],
    ['ผ้าพันคอลายขวาง', 'neck', 'mid'],
    ['แว่นกลมกรอบดำ', 'face', 'rare'],
    ['ไม้กายสิทธิ์', 'hand', 'rare'],
    ['ไม้กวาด', 'carry', 'rare'],
  ],
  hermione: [
    ['ชุดคลุมกริฟฟินดอร์', 'outer', 'rare'],
    ['เสื้อเชิ้ตขาว', 'top', 'basic'],
    ['สเวตเตอร์ถักลายขวาง', 'top', 'mid'],
    ['เนคไทลายทาง', 'tie', 'mid'],
    ['กระโปรงพลีทสีเทาเข้ม', 'bottom', 'basic'],
    ['รองเท้ามีสายคาด', 'shoes', 'basic'],
    ['ผ้าพันคอลายขวาง', 'neck', 'mid'],
    ['นาฬิกาย้อนเวลา', 'accessory', 'rare'],
    ['ไม้กายสิทธิ์ลายเถา', 'hand', 'rare'],
    ['กระเป๋าหนังใส่หนังสือ', 'bag', 'rare'],
  ],
  ron: [
    ['ชุดคลุมสีดำเลือดหมู', 'outer', 'rare'],
    ['เสื้อเชิ้ตขาว', 'top', 'basic'],
    ['สเวตเตอร์สีแดงเลือดหมูอักษร R', 'top', 'mid'],
    ['เนคไทแดงทอง', 'tie', 'mid'],
    ['กางเกงสีเทาถ่าน', 'bottom', 'basic'],
    ['รองเท้าหนังสีน้ำตาล', 'shoes', 'basic'],
    ['ผ้าพันคอแดงทอง', 'neck', 'mid'],
    ['หมวกไหมพรมมีปอม', 'head', 'mid'],
    ['ไม้กายสิทธิ์ไม้ธรรมดา', 'hand', 'rare'],
    ['กระเป๋าสะพายหนังสีน้ำตาล', 'bag', 'rare'],
  ],
  dumbledore: [
    ['ชุดคลุมลายดาวสีลาเวนเดอร์', 'outer', 'rare'],
    ['เสื้อทูนิกสีเทาอ่อน', 'top', 'mid'],
    ['กางเกงสีเทา', 'bottom', 'basic'],
    ['รองเท้าแตะกำมะหยี่สีม่วง', 'shoes', 'basic'],
    ['หมวกพ่อมดปักลายสีม่วง', 'head', 'rare'],
    ['แว่นครึ่งวงกรอบทอง', 'face', 'mid'],
    ['ผ้าคลุมสีพลัม', 'outer', 'rare'],
    ['สายคาดเอวถักสีเงิน', 'waist', 'mid'],
    ['ไม้กายสิทธิ์เอลเดอร์', 'hand', 'rare'],
    ['แหวนทองโบราณ', 'accessory', 'rare'],
  ],
  draco: [
    ['ชุดคลุมสีดำขลิบเขียว', 'outer', 'rare'],
    ['เสื้อเชิ้ตขาว', 'top', 'basic'],
    ['เสื้อกั๊กเทาขลิบเขียว', 'top', 'mid'],
    ['เนคไทเขียวเงิน', 'tie', 'mid'],
    ['กางเกงสีดำ', 'bottom', 'basic'],
    ['รองเท้าหนังสีดำ', 'shoes', 'basic'],
    ['ผ้าพันคอเขียวเงิน', 'neck', 'mid'],
    ['ถุงมือหนังสีดำ', 'gloves', 'mid'],
    ['ไม้กายสิทธิ์ไม้เข้ม', 'hand', 'rare'],
    ['กระเป๋าสะพายสีดำ', 'bag', 'rare'],
  ],
  hagrid: [
    ['เสื้อโค้ทตัวใหญ่สีน้ำตาล', 'outer', 'rare'],
    ['เสื้อทำงานสีเบจ', 'top', 'basic'],
    ['เสื้อกั๊กหนังสีน้ำตาล', 'top', 'mid'],
    ['กางเกงขายานทรงกว้าง', 'bottom', 'basic'],
    ['รองเท้าบูทหนัก', 'shoes', 'mid'],
    ['เข็มขัดหัวทองเหลือง', 'waist', 'basic'],
    ['ถุงมือทำงาน', 'gloves', 'mid'],
    ['ผ้าพันคอสีเขียวมอส', 'neck', 'mid'],
    ['ร่มสีชมพู', 'carry', 'rare'],
    ['กระเป๋าสะพายหนังสไตล์ชนบท', 'bag', 'rare'],
  ],
};
const PETS: Record<string, string> = {
  harry: 'เฮดวิก (นกฮูกสีขาว)',
  hermione: 'ครุกแชงค์ส (แมวสีส้ม)',
  ron: 'สแคบเบอร์ส (หนู)',
  dumbledore: 'ฟอว์กส์ (ฟีนิกซ์)',
  draco: 'นกฮูกประจำตัว',
  hagrid: 'แฟง (สุนัขตัวใหญ่)',
};

/** ชนิดของไอเท็มที่ต้องวางต่างจากค่าเริ่มต้นของช่อง (ใช้ตอนสวมซ้อนบนตัวละคร) */
export type Fit = 'long' | 'ring' | 'wand' | 'broom' | 'umbrella';
export const FIT: Record<string, Fit> = {
  'ron-05': 'long',
  'dumbledore-03': 'long',
  'draco-05': 'long',
  'dumbledore-10': 'ring',
  'harry-09': 'wand',
  'hermione-09': 'wand',
  'ron-09': 'wand',
  'dumbledore-09': 'wand',
  'draco-09': 'wand',
  'harry-10': 'broom',
  'hagrid-09': 'umbrella',
};

export const ITEMS: readonly Item[] = [
  ...CHARACTERS.flatMap((c) =>
    RAW[c.id]!.map(([th, slot, tier], i) => ({
      id: `${c.id}-${String(i + 1).padStart(2, '0')}`,
      collection: c.id,
      th,
      slot,
      price: PRICE[tier],
    })),
  ),
  ...CHARACTERS.map<Item>((c) => ({
    id: `${c.id}-pet`,
    collection: c.id,
    th: PETS[c.id]!,
    slot: 'companion',
    price: PRICE.pet,
  })),
];
const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export const getItem = (id: string): Item | undefined => BY_ID.get(id);
export const getCharacter = (id: string): Character | undefined =>
  CHARACTERS.find((c) => c.id === id);
export const imagePath = (it: Item): string =>
  it.slot === 'companion' ? `/game/companions/${it.collection}.webp` : `/game/items/${it.id}.webp`;
export const characterImage = (id: string): string => `/game/characters/${id}.webp`;

// ---------------------------------------------------------------- แต้ม
export const WELCOME_POINTS = 30;
/** แต้มต่อการสร้างงาน (วันละไม่เกิน CREATE_DAILY_CAP งานที่ได้แต้ม) */
export const CREATE_POINTS = 1;
export const CREATE_DAILY_CAP = 10;
/** งานที่เสร็จแล้วได้แต้มต่อวันไม่เกิน COMPLETE_DAILY_CAP งาน */
export const COMPLETE_DAILY_CAP = 30;
export const DAILY_FIRST_BONUS = 2;

/** แต้มเมื่อทำงานเสร็จ: 5 + 3 ถ้างานสำคัญ (≥3) + 2 ถ้าเสร็จทันเดดไลน์ (มีเดดไลน์และเสร็จก่อนหมดเวลา) */
export function completePoints(t: {
  importance: number;
  dueAt: string | null;
  dueDate: string | null;
  completedAt: string;
}): number {
  const end =
    t.dueAt ??
    (t.dueDate
      ? new Date(Date.parse(`${t.dueDate}T00:00:00+07:00`) + 86_400_000).toISOString()
      : null);
  return 5 + (t.importance >= 3 ? 3 : 0) + (end && t.completedAt <= end ? 2 : 0);
}

/** ชื่อที่ Dobby ใช้เรียกผู้ใช้ (null = ยังไม่มีตัวละคร ใช้ถ้อยคำเดิม) */
export function callName(
  p: { displayName: string; honorific: Honorific } | null | undefined,
): string | null {
  if (!p) return null;
  const n = p.displayName.trim();
  if (p.honorific === 'master' || !n) return MASTER;
  return p.honorific === 'both' ? `${MASTER}${n}` : n;
}

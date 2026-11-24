/**
 * ตัวละคร 2D แบบชั้นภาพ (ใช้ร่วมกันทั้งเซิร์ฟเวอร์และเว็บ): แคตาล็อกไอเท็ม + ตัวประกอบ SVG จาก "หน้าตา" (look) ของผู้ใช้
 *
 * ภาพมาจากงานของผู้ใช้ใน art/ (Hair, dress) — แปลงด้วย scripts/avatar2d/export.py:
 *  - ชุด (outfit): ตัวละครเต็มตัว (หัวล้าน) ตัดพื้นหลังแล้ว  → ชั้นล่าง
 *  - ทรงผม (hair): เฉพาะผม สกัดจากภาพตัวละคร               → ชั้นบน
 * ทุกชิ้นถูกจัดเข้ากรอบ CANVAS_W×CANVAS_H เดียวกันด้วยตำแหน่งตา จึงซ้อนกันได้ตรง ไม่ต้องคำนวณตำแหน่ง
 * รายการไอเท็ม (ชื่อ ราคา ไฟล์) สร้างอัตโนมัติที่ avatar2dItems.ts — ดู docs/AVATAR_2D.md
 *
 * สีผม: ภาพผมเป็นสีเทาอมน้ำตาลเดียว เปลี่ยนสีด้วยฟิลเตอร์ SVG (คูณความสว่างของภาพด้วยสีเป้าหมาย) ไม่ต้องมีไฟล์ต่อสี
 * สีทุกค่ามาจากรายการคงที่ และไฟล์ภาพตรวจด้วย regex จึงใส่ลงหน้าเว็บเป็น innerHTML ได้ปลอดภัย
 */
import { ART_ITEMS } from './avatar2dItems';

export const CANVAS_W = 400;
export const CANVAS_H = 490;

// ---------------------------------------------------------------- ช่อง
/** ลำดับวาดจากล่างขึ้นบน: ชุด (มีหัว/ตัว) แล้วทรงผมทับบนหัว */
export const SLOTS = ['outfit', 'hair'] as const;
export type AvatarSlot = (typeof SLOTS)[number];

export const SLOT_TH: Record<AvatarSlot, string> = {
  outfit: 'ชุด',
  hair: 'ทรงผม',
};

/** ช่องที่ต้องมีเสมอ (ชุดคือตัวละคร ถอดแล้วไม่เหลือภาพ) */
export const REQUIRED_SLOTS: readonly AvatarSlot[] = ['outfit'];

/** กรอบซูมของรูปตัวอย่างไอเท็มแต่ละช่อง (x y w h ในพิกัด canvas) — ช่องที่ไม่ระบุ = เห็นทั้งตัว */
export const SLOT_FOCUS: Partial<Record<AvatarSlot, string>> = {
  hair: '50 0 300 290',
};

// ---------------------------------------------------------------- สีผม
export const HAIR_COLORS = [
  { id: 'natural', th: 'สีเดิมของภาพ', color: '#c8ad93' },
  { id: 'black', th: 'ดำ', color: '#2a2327' },
  { id: 'darkbrown', th: 'น้ำตาลเข้ม', color: '#4a3226' },
  { id: 'brown', th: 'น้ำตาล', color: '#7a523a' },
  { id: 'chestnut', th: 'น้ำตาลแดง', color: '#9c5a35' },
  { id: 'blonde', th: 'บลอนด์', color: '#e3bf6a' },
  { id: 'ginger', th: 'ส้มแดง', color: '#d0642b' },
  { id: 'pink', th: 'ชมพู', color: '#ee8fb0' },
  { id: 'blue', th: 'ฟ้า', color: '#5f9be0' },
  { id: 'purple', th: 'ม่วง', color: '#9470d6' },
  { id: 'silver', th: 'เงิน', color: '#d4d8de' },
] as const;
export type HairColorId = (typeof HAIR_COLORS)[number]['id'];
export const HAIR_COLOR_IDS = HAIR_COLORS.map((s) => s.id) as [HairColorId, ...HairColorId[]];

// ---------------------------------------------------------------- แคตาล็อก
export interface AvatarItem {
  id: string;
  slot: AvatarSlot;
  th: string;
  /** ราคา (แต้ม): 0 = ใช้ได้ทันทีไม่ต้องซื้อ */
  price: number;
  /** หัวข้อกลุ่มในหน้าเลือก (เช่น สาวน้อย / ฮาโลวีน) */
  group: string;
  /** ไฟล์ภาพภายใต้ /avatar2d/ */
  file: string;
}

export const AVATAR_ITEMS: readonly AvatarItem[] = ART_ITEMS;

const BY_ID = new Map(AVATAR_ITEMS.map((i) => [i.id, i]));
export const getAvatarItem = (id: string): AvatarItem | undefined => BY_ID.get(id);
export const isFreeItem = (id: string): boolean => (BY_ID.get(id)?.price ?? 1) === 0;

// ---------------------------------------------------------------- หน้าตา (look)
export interface AvatarLook {
  hairColor: HairColorId;
  /** ช่อง → รหัสไอเท็ม (ผมเว้นว่างได้ = หัวล้าน; ชุดต้องมี) */
  items: Partial<Record<AvatarSlot, string>>;
}

export const DEFAULT_LOOK: AvatarLook = {
  hairColor: 'natural',
  items: { outfit: 'a-outfit-t-hoodie-joggers', hair: 'a-hair-f-pixie' },
};

/** ไอเท็มที่ต้องมีในคลังก่อนสวม (ไม่นับของฟรี) */
export function lookItemIds(look: AvatarLook): string[] {
  return Object.values(look.items).filter((x): x is string => !!x);
}

/** ตรวจว่า look ถูกต้อง: ช่องถูกต้อง ไอเท็มมีอยู่จริงและอยู่ช่องของมัน ช่องบังคับครบ; คืนข้อความผิดพลาด หรือ null */
export function validateLook(look: AvatarLook): string | null {
  for (const [slot, id] of Object.entries(look.items)) {
    if (!(SLOTS as readonly string[]).includes(slot)) return `ไม่รู้จักช่อง ${slot}`;
    if (id === undefined) continue;
    const item = BY_ID.get(id);
    if (!item) return `ไม่พบไอเท็ม ${id}`;
    if (item.slot !== slot) return `ไอเท็ม ${id} ไม่ใช่ของช่อง ${slot}`;
  }
  for (const slot of REQUIRED_SLOTS) if (!look.items[slot]) return `ต้องเลือก${SLOT_TH[slot]}`;
  return null;
}

// ---------------------------------------------------------------- ตัววาด SVG
/** ชื่อไฟล์ปลอดภัยใต้ /avatar2d/ (กัน path/อักขระแปลกใน innerHTML) */
const SAFE_FILE = /^[A-Za-z0-9_\-/]+\.(png|webp|svg)$/;
const HAIR_REF_LUMA = 0.69; // ความสว่างเฉลี่ยของผมสีเดิมในภาพ (0..1)

/** ฟิลเตอร์เปลี่ยนสีผม: R'G'B' = (สีเป้าหมาย ÷ ความสว่างเดิม) × ความสว่างของพิกเซล */
function hairFilter(colorId: HairColorId): { defs: string; attr: string } {
  if (colorId === 'natural') return { defs: '', attr: '' };
  const hex = HAIR_COLORS.find((c) => c.id === colorId)?.color ?? '#c8ad93';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const k = (t: number) => {
    const g0 = t / HAIR_REF_LUMA;
    return `${(0.2126 * g0).toFixed(4)} ${(0.7152 * g0).toFixed(4)} ${(0.0722 * g0).toFixed(4)} 0 0`;
  };
  const id = `hc-${colorId}`;
  return {
    defs: `<defs><filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feColorMatrix type="matrix" values="${k(r)} ${k(g)} ${k(b)} 0 0 0 1 0"/></filter></defs>`,
    attr: ` filter="url(#${id})"`,
  };
}

const imageLayer = (file: string, extra = '') =>
  SAFE_FILE.test(file)
    ? `<image href="/avatar2d/${file}" x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}"${extra}/>`
    : '';

export interface RenderOptions {
  /** กรอบมองเฉพาะส่วน "x y w h" (ตัวเลขเท่านั้น) — ไม่ใส่ = ทั้ง canvas */
  viewBox?: string;
  /** ขนาดที่แสดง (px กว้าง) — ไม่ใส่ = ยืดตามกล่องแม่ */
  width?: number;
  /** ข้อความอธิบายสำหรับ screen reader */
  label?: string;
}

/** SVG ทั้งตัวของ look (สตริง) — ไฟล์/สีมาจากแคตาล็อกและรายการคงที่เท่านั้น */
export function renderAvatarSvg(look: AvatarLook, opts: RenderOptions = {}): string {
  const at = (slot: AvatarSlot) => {
    const id = look.items[slot];
    return id ? BY_ID.get(id) : undefined;
  };
  const outfit = at('outfit');
  const hair = at('hair');
  const hf = hairFilter(look.hairColor);
  const layers =
    (outfit ? imageLayer(outfit.file) : '') + (hair ? imageLayer(hair.file, hf.attr) : '');
  const vb =
    opts.viewBox && /^[\d.\s-]{3,40}$/.test(opts.viewBox)
      ? opts.viewBox
      : `0 0 ${CANVAS_W} ${CANVAS_H}`;
  const size = opts.width ? ` width="${opts.width}"` : '';
  const label = (opts.label ?? 'ตัวละคร').replace(/[<>&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${size} role="img" aria-label="${label}" style="display:block;height:auto;max-width:100%">${hair ? hf.defs : ''}${layers}</svg>`;
}

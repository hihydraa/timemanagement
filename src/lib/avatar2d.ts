/**
 * ตัวละคร 2D แบบชั้นภาพ (ใช้ร่วมกันทั้งเซิร์ฟเวอร์และเว็บ):
 * แคตาล็อกไอเท็ม (ช่อง/ราคา/ภาพ) + ตัวประกอบ SVG จาก "หน้าตา" (look) ของผู้ใช้
 *
 * ภาพของแต่ละไอเท็มมี 2 แบบ:
 *  - vector: วาดเป็น SVG ในโค้ดนี้ (ชุดเริ่มต้น) สีผม/สีผิวเปลี่ยนได้ทันที
 *  - image: ชี้ไปที่ไฟล์ PNG/WebP/SVG ใน apps/web/public/avatar2d/ (ภาพของผู้ใช้เอง) ขนาด canvas เท่ากัน
 *    (CANVAS_W×CANVAS_H) โปร่งใส — เพิ่มไอเท็มด้วยการเติมแถวในแคตาล็อกเท่านั้น ไม่ต้องแก้ระบบ
 * สีทุกค่าใน SVG มาจากรายการสีที่กำหนดไว้ในไฟล์นี้เท่านั้น (ไม่รับสีจากผู้ใช้ตรง ๆ) จึงใส่ลงหน้าเว็บเป็น innerHTML ได้ปลอดภัย
 */

export const CANVAS_W = 300;
export const CANVAS_H = 420;

// ---------------------------------------------------------------- ช่อง
/** ลำดับวาดจากล่างขึ้นบน (ยกเว้นผมที่แยกชั้นหลัง/หน้า ดู renderAvatarSvg) */
export const SLOTS = [
  'hair',
  'shoes',
  'bottom',
  'top',
  'outfit',
  'neck',
  'glasses',
  'hat',
  'hand',
  'companion',
] as const;
export type AvatarSlot = (typeof SLOTS)[number];

export const SLOT_TH: Record<AvatarSlot, string> = {
  hair: 'ทรงผม',
  top: 'เสื้อ',
  bottom: 'กางเกง/กระโปรง',
  outfit: 'ชุดเต็มตัว',
  shoes: 'รองเท้า',
  hat: 'หมวก/เครื่องประดับผม',
  glasses: 'แว่น',
  neck: 'ของที่คอ',
  hand: 'ของถือ',
  companion: 'สัตว์เลี้ยง',
};

// ---------------------------------------------------------------- สีผิว / สีผม
export const SKINS = [
  { id: 'porcelain', th: 'ขาวอมชมพู', color: '#fde3d3', shade: '#f2c4ae' },
  { id: 'light', th: 'ขาว', color: '#f8d5b8', shade: '#e8b896' },
  { id: 'tan', th: 'ขาวเหลือง', color: '#efc197', shade: '#d9a176' },
  { id: 'warm', th: 'แทน', color: '#d9a273', shade: '#bf8559' },
  { id: 'brown', th: 'น้ำตาล', color: '#a8714b', shade: '#8d5a38' },
  { id: 'deep', th: 'เข้ม', color: '#6f4630', shade: '#59371f' },
] as const;
export type SkinId = (typeof SKINS)[number]['id'];

export const HAIR_COLORS = [
  { id: 'black', th: 'ดำ', color: '#2a2327', shade: '#17131a' },
  { id: 'darkbrown', th: 'น้ำตาลเข้ม', color: '#4a3226', shade: '#33221a' },
  { id: 'brown', th: 'น้ำตาล', color: '#7a523a', shade: '#5d3d2a' },
  { id: 'chestnut', th: 'น้ำตาลแดง', color: '#9c5a35', shade: '#7c4528' },
  { id: 'blonde', th: 'บลอนด์', color: '#e3bf6a', shade: '#c79d44' },
  { id: 'ginger', th: 'ส้มแดง', color: '#d0642b', shade: '#b04a1b' },
  { id: 'pink', th: 'ชมพู', color: '#ee8fb0', shade: '#d06f92' },
  { id: 'blue', th: 'ฟ้า', color: '#5f9be0', shade: '#437dc0' },
  { id: 'purple', th: 'ม่วง', color: '#9470d6', shade: '#7752b8' },
  { id: 'silver', th: 'เงิน', color: '#c9ced6', shade: '#a3aab5' },
] as const;
export type HairColorId = (typeof HAIR_COLORS)[number]['id'];

// ---------------------------------------------------------------- แคตาล็อก
/** ราคา (แต้ม): 0 = ใช้ได้ทันทีไม่ต้องซื้อ */
export type AvatarArt =
  | { kind: 'vector' }
  | {
      kind: 'image';
      /** ไฟล์ภายใต้ /avatar2d/ เช่น 'hair/wave.png' */
      file: string;
      /** ชั้นหลังตัวละคร (เฉพาะผม/สัตว์เลี้ยง) เช่น ผมยาวด้านหลัง */
      back?: string;
    };

export interface AvatarItem {
  id: string;
  slot: AvatarSlot;
  th: string;
  price: number;
  art: AvatarArt;
  /** ชุดเต็มตัวใช้ร่วมกับเสื้อ/กางเกงไม่ได้ (ซ่อนสองช่องนั้นตอนแสดง) */
}

const V: AvatarArt = { kind: 'vector' };
const it = (id: string, slot: AvatarSlot, th: string, price: number): AvatarItem => ({
  id: `a-${id}`,
  slot,
  th,
  price,
  art: V,
});

export const AVATAR_ITEMS: readonly AvatarItem[] = [
  // ทรงผม
  it('hair-short', 'hair', 'ผมสั้น', 0),
  it('hair-bob', 'hair', 'ผมบ็อบ', 0),
  it('hair-long', 'hair', 'ผมยาวตรง', 30),
  it('hair-ponytail', 'hair', 'ผมม้าหางม้า', 30),
  it('hair-twin', 'hair', 'ผมแกละคู่', 40),
  it('hair-bun', 'hair', 'ผมมวย', 40),
  it('hair-curly', 'hair', 'ผมหยิกฟู', 50),
  it('hair-spiky', 'hair', 'ผมตั้งกระเซิง', 50),
  // เสื้อ
  it('top-tee-white', 'top', 'เสื้อยืดขาว', 0),
  it('top-tee-sky', 'top', 'เสื้อยืดฟ้า', 20),
  it('top-shirt-tie', 'top', 'เสื้อเชิ้ต+เนคไท', 40),
  it('top-hoodie', 'top', 'ฮู้ดสีส้ม', 60),
  it('top-cardigan', 'top', 'คาร์ดิแกนเขียว', 60),
  it('top-sweater', 'top', 'สเวตเตอร์แดง', 60),
  // กางเกง/กระโปรง
  it('bottom-shorts', 'bottom', 'กางเกงขาสั้นยีนส์', 0),
  it('bottom-jeans', 'bottom', 'กางเกงยีนส์ขายาว', 30),
  it('bottom-cargo', 'bottom', 'กางเกงคาร์โก้', 40),
  it('bottom-skirt-pleat', 'bottom', 'กระโปรงพลีทแดง', 40),
  it('bottom-skirt-pink', 'bottom', 'กระโปรงชมพู', 40),
  // ชุดเต็มตัว
  it('outfit-dress', 'outfit', 'เดรสสีชมพู', 80),
  it('outfit-robe', 'outfit', 'ชุดคลุมพ่อมดม่วง', 120),
  it('outfit-ghost', 'outfit', 'ชุดผี', 120),
  it('outfit-overall', 'outfit', 'ชุดเอี๊ยมเหลือง', 90),
  // รองเท้า
  it('shoes-sneaker', 'shoes', 'รองเท้าผ้าใบขาว', 0),
  it('shoes-boots', 'shoes', 'รองเท้าบูทน้ำตาล', 30),
  it('shoes-sandals', 'shoes', 'รองเท้าแตะชมพู', 20),
  // หมวก
  it('hat-cap', 'hat', 'หมวกแก๊ปแดง', 30),
  it('hat-beanie', 'hat', 'หมวกไหมพรมเทา', 30),
  it('hat-wizard', 'hat', 'หมวกพ่อมด', 70),
  it('hat-crown', 'hat', 'มงกุฎทอง', 100),
  it('hat-ribbon', 'hat', 'โบว์ติดผมสีแดง', 20),
  // แว่น
  it('glasses-round', 'glasses', 'แว่นกลมกรอบดำ', 30),
  it('glasses-square', 'glasses', 'แว่นเหลี่ยมสีแดง', 30),
  it('glasses-sun', 'glasses', 'แว่นกันแดด', 40),
  // คอ
  it('neck-scarf', 'neck', 'ผ้าพันคอแดง', 30),
  it('neck-bow', 'neck', 'หูกระต่ายผูกคอสีฟ้า', 20),
  // ของถือ
  it('hand-wand', 'hand', 'ไม้กายสิทธิ์', 60),
  it('hand-book', 'hand', 'หนังสือ', 40),
  // สัตว์เลี้ยง
  it('pet-cat', 'companion', 'แมวส้ม', 150),
  it('pet-dog', 'companion', 'สุนัขน้อย', 150),
  it('pet-owl', 'companion', 'นกฮูก', 150),
];

const BY_ID = new Map(AVATAR_ITEMS.map((i) => [i.id, i]));
export const getAvatarItem = (id: string): AvatarItem | undefined => BY_ID.get(id);
export const isFreeItem = (id: string): boolean => (BY_ID.get(id)?.price ?? 1) === 0;

// ---------------------------------------------------------------- หน้าตา (look)
export interface AvatarLook {
  skin: SkinId;
  hairColor: HairColorId;
  /** ช่อง → รหัสไอเท็ม (ไม่มี = ไม่สวม) */
  items: Partial<Record<AvatarSlot, string>>;
}

export const DEFAULT_LOOK: AvatarLook = {
  skin: 'light',
  hairColor: 'brown',
  items: {
    hair: 'a-hair-short',
    top: 'a-top-tee-white',
    bottom: 'a-bottom-shorts',
    shoes: 'a-shoes-sneaker',
  },
};

export const SKIN_IDS = SKINS.map((s) => s.id) as [SkinId, ...SkinId[]];
export const HAIR_COLOR_IDS = HAIR_COLORS.map((s) => s.id) as [HairColorId, ...HairColorId[]];

/** ไอเท็มที่ต้องมีในคลังก่อนสวม (ไม่นับของฟรี) */
export function lookItemIds(look: AvatarLook): string[] {
  return Object.values(look.items).filter((x): x is string => !!x);
}

/** ตรวจว่า look ถูกต้อง: ช่องถูกต้อง ไอเท็มมีอยู่จริงและอยู่ช่องของมัน; คืนข้อความผิดพลาด หรือ null */
export function validateLook(look: AvatarLook): string | null {
  for (const [slot, id] of Object.entries(look.items)) {
    if (!(SLOTS as readonly string[]).includes(slot)) return `ไม่รู้จักช่อง ${slot}`;
    if (id === undefined) continue;
    const item = BY_ID.get(id);
    if (!item) return `ไม่พบไอเท็ม ${id}`;
    if (item.slot !== slot) return `ไอเท็ม ${id} ไม่ใช่ของช่อง ${slot}`;
  }
  return null;
}

// ---------------------------------------------------------------- ตัววาด SVG (vector)
const INK = '#3a2c2c';
const skinOf = (id: SkinId) => SKINS.find((s) => s.id === id) ?? SKINS[1];
const hairOf = (id: HairColorId) => HAIR_COLORS.find((s) => s.id === id) ?? HAIR_COLORS[2];

interface Palette {
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
}

const p = (d: string, fill: string, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const line = (d: string, stroke: string, w: number, extra = '') =>
  `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const circ = (cx: number, cy: number, r: number, fill: string, extra = '') =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;
const ell = (cx: number, cy: number, rx: number, ry: number, fill: string, extra = '') =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;

// เรขาคณิตกลางของตัวละคร (หัวใหญ่แบบชิบิ)
const TORSO = 'M108 214 Q150 200 192 214 L198 302 Q150 316 102 302 Z';
const ARM_L = 'M112 224 Q84 256 84 292';
const ARM_R = 'M188 224 Q216 256 216 292';

function bodyLayer(c: Palette): string {
  return [
    // ขา
    line('M131 300 L131 360', c.skin, 24),
    line('M169 300 L169 360', c.skin, 24),
    // แขน
    line(ARM_L, c.skin, 22),
    line(ARM_R, c.skin, 22),
    // ลำตัว + คอ
    p(TORSO, c.skin),
    `<rect x="136" y="196" width="28" height="22" rx="8" fill="${c.skin}"/>`,
    // หัว + หู
    circ(68, 132, 11, c.skin),
    circ(232, 132, 11, c.skin),
    ell(150, 126, 82, 76, c.skin),
    // หน้า
    ell(118, 136, 9, 12, INK),
    ell(182, 136, 9, 12, INK),
    circ(121, 131, 3.4, '#fff'),
    circ(185, 131, 3.4, '#fff'),
    ell(98, 158, 13, 7, '#f08a8a', 'opacity="0.35"'),
    ell(202, 158, 13, 7, '#f08a8a', 'opacity="0.35"'),
    line('M139 160 Q150 170 161 160', INK, 3.2),
  ].join('');
}

// ---- ผม: [ชั้นหลัง, ชั้นหน้า]
const FRINGE =
  'M66 130 Q60 50 150 44 Q240 50 234 130 Q224 92 192 88 Q150 110 108 88 Q76 92 66 130 Z';
const hairParts: Record<string, (c: Palette) => [string, string]> = {
  'a-hair-short': (c) => ['', p(FRINGE, c.hair) + line('M118 70 Q150 58 182 70', c.hairShade, 3)],
  'a-hair-bob': (c) => [
    p('M62 130 Q56 56 150 46 Q244 56 238 130 L240 196 Q150 212 60 196 Z', c.hair),
    p('M68 128 Q62 52 150 46 Q238 52 232 128 L226 102 Q150 118 74 102 Z', c.hair) +
      line('M90 80 Q150 60 210 80', c.hairShade, 3),
  ],
  'a-hair-long': (c) => [
    p('M60 130 Q54 52 150 44 Q246 52 240 130 L252 318 Q150 336 48 318 Z', c.hair),
    p('M66 130 Q60 50 150 44 Q240 50 234 130 Q214 96 150 100 Q86 96 66 130 Z', c.hair) +
      line('M150 46 Q148 80 120 108', c.hairShade, 3),
  ],
  'a-hair-ponytail': (c) => [
    p('M212 76 Q282 56 278 150 Q272 222 238 240 Q258 150 216 104 Z', c.hair) +
      circ(214, 92, 8, '#e8566b'),
    p(FRINGE, c.hair),
  ],
  'a-hair-twin': (c) => [
    p('M64 112 Q20 130 30 232 Q60 246 84 200 Q62 160 78 120 Z', c.hair) +
      p('M236 112 Q280 130 270 232 Q240 246 216 200 Q238 160 222 120 Z', c.hair),
    p(FRINGE, c.hair) + circ(70, 112, 8, '#e8566b') + circ(230, 112, 8, '#e8566b'),
  ],
  'a-hair-bun': (c) => ['', circ(150, 40, 28, c.hair) + p(FRINGE, c.hair)],
  'a-hair-curly': (c) => [
    [
      [70, 100, 28],
      [96, 62, 30],
      [150, 50, 32],
      [204, 62, 30],
      [230, 100, 28],
      [60, 150, 24],
      [240, 150, 24],
    ]
      .map(([x, y, r]) => circ(x!, y!, r!, c.hair))
      .join(''),
    p(
      'M72 126 Q70 70 150 62 Q230 70 228 126 Q214 100 188 98 Q150 114 112 98 Q86 100 72 126 Z',
      c.hair,
    ),
  ],
  'a-hair-spiky': (c) => [
    '',
    p(
      'M64 132 L56 78 L92 92 L100 36 L128 76 L150 26 L172 76 L200 36 L208 92 L244 78 L236 132 Q224 96 192 92 Q150 112 108 92 Q76 96 64 132 Z',
      c.hair,
    ),
  ],
};

// ---- เสื้อผ้า
const sleeve = (fill: string, long: boolean) =>
  line(ARM_L.replace(/ 84 292$/, long ? ' 84 284' : ' 92 246'), fill, 26) +
  line(ARM_R.replace(/ 216 292$/, long ? ' 216 284' : ' 208 246'), fill, 26);

const topParts: Record<string, () => string> = {
  'a-top-tee-white': () =>
    sleeve('#ffffff', false) +
    p(TORSO, '#ffffff') +
    line('M126 214 Q150 226 174 214', '#d9dde3', 3),
  'a-top-tee-sky': () =>
    sleeve('#7fc0f0', false) +
    p(TORSO, '#7fc0f0') +
    line('M126 214 Q150 226 174 214', '#5aa3d8', 3),
  'a-top-shirt-tie': () =>
    sleeve('#ffffff', true) +
    p(TORSO, '#ffffff') +
    p('M132 210 L150 232 L168 210 L158 206 L150 214 L142 206 Z', '#e9edf2') +
    p('M146 224 L154 224 L158 270 L150 280 L142 270 Z', '#c8323c') +
    circ(150, 240, 0, '#fff'),
  'a-top-hoodie': () =>
    sleeve('#f08a3c', true) +
    p(TORSO, '#f08a3c') +
    p('M114 262 L186 262 L190 292 L110 292 Z', '#dc7428') +
    p('M128 206 Q150 238 172 206 Q150 196 128 206 Z', '#dc7428') +
    line('M142 232 L142 258', '#fff', 3) +
    line('M158 232 L158 258', '#fff', 3),
  'a-top-cardigan': () =>
    sleeve('#6fb27a', true) +
    p(TORSO, '#6fb27a') +
    p('M120 214 L150 214 L150 304 L102 302 Z', '#7fc08a', 'opacity="0.5"') +
    line('M150 216 L150 304', '#4f8e5a', 3) +
    circ(150, 240, 4, '#f5e9c6') +
    circ(150, 266, 4, '#f5e9c6'),
  'a-top-sweater': () =>
    sleeve('#d8505a', true) +
    p(TORSO, '#d8505a') +
    line('M106 252 Q150 262 196 252', '#f4d7d9', 6) +
    line('M104 276 Q150 286 198 276', '#f4d7d9', 6) +
    line('M126 212 Q150 224 174 212', '#b83a44', 5),
};

const bottomParts: Record<string, () => string> = {
  'a-bottom-shorts': () =>
    p('M104 296 L196 296 L194 330 L158 330 L150 314 L142 330 L106 330 Z', '#5b86c0') +
    line('M104 296 L196 296', '#456ea3', 4),
  'a-bottom-jeans': () =>
    p('M104 296 L196 296 L194 364 L160 364 L150 318 L140 364 L106 364 Z', '#3d5c92') +
    line('M104 296 L196 296', '#2e4a78', 4) +
    line('M150 318 L150 300', '#2e4a78', 2),
  'a-bottom-cargo': () =>
    p('M104 296 L196 296 L194 356 L160 356 L150 318 L140 356 L106 356 Z', '#b39b6a') +
    line('M104 296 L196 296', '#8e7a50', 4) +
    p('M110 322 L126 322 L126 338 L110 338 Z', '#9d8758') +
    p('M174 322 L190 322 L190 338 L174 338 Z', '#9d8758'),
  'a-bottom-skirt-pleat': () =>
    p('M102 292 L198 292 L214 342 L86 342 Z', '#c8323c') +
    [112, 128, 144, 160, 176, 192]
      .map((x) => line(`M${x} 296 L${x + (x - 150) * 0.28} 342`, '#a02530', 2))
      .join(''),
  'a-bottom-skirt-pink': () =>
    p('M102 292 L198 292 Q226 330 218 344 Q150 358 82 344 Q74 330 102 292 Z', '#f4a3c4') +
    line('M96 340 Q150 352 204 340', '#e17ea8', 3),
};

const outfitParts: Record<string, () => string> = {
  'a-outfit-dress': () =>
    sleeve('#f7b6cf', false) +
    p(TORSO, '#f7b6cf') +
    p('M102 290 L198 290 Q232 340 224 356 Q150 374 76 356 Q68 340 102 290 Z', '#f7b6cf') +
    line('M96 352 Q150 366 204 352', '#e88fb3', 4) +
    line('M108 258 Q150 268 192 258', '#e88fb3', 4) +
    circ(150, 262, 5, '#fff'),
  'a-outfit-robe': () =>
    sleeve('#6a4fb0', true) +
    p('M104 212 Q150 198 196 212 L226 366 Q150 384 74 366 Z', '#6a4fb0') +
    p('M142 212 L158 212 L166 372 L134 372 Z', '#8268c8') +
    [
      [118, 262],
      [186, 292],
      [126, 330],
      [178, 336],
    ]
      .map(
        ([x, y]) =>
          `<path d="M${x} ${y! - 7} L${x! + 2} ${y! - 2} L${x! + 7} ${y!} L${x! + 2} ${y! + 2} L${x} ${y! + 7} L${x! - 2} ${y! + 2} L${x! - 7} ${y!} L${x! - 2} ${y! - 2} Z" fill="#ffd966"/>`,
      )
      .join('') +
    line('M126 214 Q150 230 174 214', '#ffd966', 4),
  'a-outfit-ghost': () =>
    p('M96 212 Q150 190 204 212 Q246 290 240 366 Q150 388 60 366 Q54 290 96 212 Z', '#fbfbfd') +
    line('M64 360 Q106 376 150 366 Q194 376 236 360', '#dcdde6', 4) +
    line('M122 256 L138 272 M138 256 L122 272', '#6a4a3a', 5) +
    line('M162 256 L178 272 M178 256 L162 272', '#6a4a3a', 5) +
    line('M128 292 Q150 312 172 292', '#6a4a3a', 5),
  'a-outfit-overall': () =>
    sleeve('#ffffff', false) +
    p(TORSO, '#ffffff') +
    p(
      'M110 262 L190 262 L198 302 L206 354 L160 354 L150 322 L140 354 L94 354 L102 302 Z',
      '#f2c94c',
    ) +
    p('M116 214 L132 214 L138 262 L112 262 Z', '#f2c94c') +
    p('M168 214 L184 214 L188 262 L162 262 Z', '#f2c94c') +
    circ(125, 266, 4, '#c9a02a') +
    circ(175, 266, 4, '#c9a02a'),
};

const shoesParts: Record<string, () => string> = {
  'a-shoes-sneaker': () =>
    ell(126, 372, 22, 11, '#ffffff', 'stroke="#c9ced6" stroke-width="3"') +
    ell(174, 372, 22, 11, '#ffffff', 'stroke="#c9ced6" stroke-width="3"') +
    line('M112 372 L140 372', '#e8566b', 3) +
    line('M160 372 L188 372', '#e8566b', 3),
  'a-shoes-boots': () =>
    p('M114 346 L148 346 L152 372 Q152 384 138 384 L110 384 Q104 372 114 346 Z', '#8a5a3a') +
    p('M152 346 L186 346 L190 372 Q196 384 190 384 L162 384 Q148 384 148 372 Z', '#8a5a3a') +
    line('M114 350 L148 350', '#6e4529', 3) +
    line('M152 350 L186 350', '#6e4529', 3),
  'a-shoes-sandals': () =>
    ell(126, 374, 21, 8, '#f4a3c4') +
    ell(174, 374, 21, 8, '#f4a3c4') +
    line('M116 366 L136 370', '#e17ea8', 4) +
    line('M164 370 L184 366', '#e17ea8', 4),
};

const hatParts: Record<string, () => string> = {
  'a-hat-cap': () =>
    p('M70 100 Q72 42 150 40 Q228 42 230 100 Q150 86 70 100 Z', '#d8505a') +
    p('M196 98 Q246 94 262 112 Q232 116 198 108 Z', '#b83a44') +
    circ(150, 42, 6, '#b83a44'),
  'a-hat-beanie': () =>
    p('M70 104 Q70 40 150 38 Q230 40 230 104 Q150 92 70 104 Z', '#9aa3b0') +
    p('M68 100 Q150 86 232 100 L232 116 Q150 102 68 116 Z', '#7c8593') +
    circ(150, 34, 12, '#cfd5de'),
  'a-hat-wizard': () =>
    p('M54 98 Q150 72 246 98 Q150 116 54 98 Z', '#4a3a8c') +
    p('M96 90 Q124 44 164 8 Q172 44 204 90 Q150 104 96 90 Z', '#5d49aa') +
    line('M100 88 Q150 100 202 88', '#ffd966', 5),
  'a-hat-crown': () =>
    p('M96 74 L104 28 L128 52 L150 20 L172 52 L196 28 L204 74 Q150 84 96 74 Z', '#f2c94c') +
    circ(150, 52, 5, '#e8566b') +
    circ(112, 52, 4, '#5f9be0') +
    circ(188, 52, 4, '#5f9be0'),
  'a-hat-ribbon': () =>
    p('M196 62 L226 40 L228 84 Z', '#e8566b') +
    p('M196 62 L166 40 L164 84 Z', '#e8566b') +
    circ(196, 62, 8, '#c8323c'),
};

const glassesParts: Record<string, () => string> = {
  'a-glasses-round': () =>
    circ(118, 136, 20, 'none', 'stroke="#2a2327" stroke-width="4"') +
    circ(182, 136, 20, 'none', 'stroke="#2a2327" stroke-width="4"') +
    line('M138 134 L162 134', '#2a2327', 4) +
    line('M98 132 L72 126', '#2a2327', 3) +
    line('M202 132 L228 126', '#2a2327', 3),
  'a-glasses-square': () =>
    `<rect x="96" y="120" width="44" height="34" rx="7" fill="none" stroke="#c8323c" stroke-width="4"/>` +
    `<rect x="160" y="120" width="44" height="34" rx="7" fill="none" stroke="#c8323c" stroke-width="4"/>` +
    line('M140 134 L160 134', '#c8323c', 4) +
    line('M96 130 L72 126', '#c8323c', 3) +
    line('M204 130 L228 126', '#c8323c', 3),
  'a-glasses-sun': () =>
    p('M94 124 L142 124 Q142 152 118 154 Q94 152 94 124 Z', '#222') +
    p('M158 124 L206 124 Q206 152 182 154 Q158 152 158 124 Z', '#222') +
    line('M142 128 L158 128', '#222', 4) +
    line('M94 128 L72 124', '#222', 3) +
    line('M206 128 L228 124', '#222', 3) +
    line('M104 132 L116 128', '#fff', 2, 'opacity="0.5"'),
};

const neckParts: Record<string, () => string> = {
  'a-neck-scarf': () =>
    p('M124 204 Q150 224 176 204 L180 222 Q150 244 120 222 Z', '#d8505a') +
    p('M164 222 L186 222 L184 272 L164 266 Z', '#d8505a') +
    line('M170 236 L184 236', '#f4d7d9', 3) +
    line('M170 250 L183 250', '#f4d7d9', 3),
  'a-neck-bow': () =>
    p('M150 214 L120 200 L120 228 Z', '#5f9be0') +
    p('M150 214 L180 200 L180 228 Z', '#5f9be0') +
    circ(150, 214, 7, '#3f7fc4'),
};

const handParts: Record<string, () => string> = {
  'a-hand-wand': () =>
    line('M216 292 L262 236', '#6a4a30', 6) +
    circ(264, 234, 5, '#ffd966') +
    `<path d="M270 212 L273 222 L283 224 L273 227 L270 237 L267 227 L257 224 L267 222 Z" fill="#ffd966"/>`,
  'a-hand-book': () =>
    p('M60 270 L108 262 L112 312 L64 320 Z', '#5f9be0') +
    p('M64 274 L106 267 L109 306 L67 313 Z', '#f6f1e3') +
    line('M80 280 L98 277', '#c9c2ad', 2) +
    line('M81 290 L99 287', '#c9c2ad', 2) +
    circ(84, 294, 11, '#999', 'opacity="0"'),
};

const companionParts: Record<string, (c: Palette) => string> = {
  'a-pet-cat': () =>
    ell(252, 376, 28, 22, '#f0903c') +
    circ(252, 350, 17, '#f0903c') +
    p('M238 340 L240 322 L250 336 Z', '#f0903c') +
    p('M266 340 L264 322 L254 336 Z', '#f0903c') +
    circ(246, 350, 2.6, INK) +
    circ(258, 350, 2.6, INK) +
    line('M249 357 Q252 360 255 357', INK, 2) +
    line('M274 380 Q296 372 290 352', '#f0903c', 7),
  'a-pet-dog': () =>
    ell(252, 376, 28, 20, '#d9b27a') +
    circ(252, 350, 17, '#d9b27a') +
    p('M236 340 Q226 356 238 362 Z', '#a97c48') +
    p('M268 340 Q278 356 266 362 Z', '#a97c48') +
    circ(246, 350, 2.6, INK) +
    circ(258, 350, 2.6, INK) +
    ell(252, 357, 5, 3.4, INK) +
    line('M276 378 Q294 372 290 358', '#d9b27a', 7),
  'a-pet-owl': () =>
    ell(252, 370, 22, 28, '#a07a52') +
    ell(252, 376, 14, 18, '#e9d6b0') +
    circ(244, 356, 8, '#fff') +
    circ(260, 356, 8, '#fff') +
    circ(244, 356, 3.4, INK) +
    circ(260, 356, 3.4, INK) +
    p('M248 362 L256 362 L252 370 Z', '#f0a030') +
    p('M236 342 L242 332 L246 344 Z', '#a07a52') +
    p('M268 342 L262 332 L258 344 Z', '#a07a52'),
};

// ---------------------------------------------------------------- ประกอบ
/** ภาพ image-kind ของไฟล์ผู้ใช้: อนุญาตเฉพาะ path ปลอดภัยใต้ /avatar2d/ (กัน path แปลกใน innerHTML) */
const SAFE_FILE = /^[A-Za-z0-9_\-/]+\.(png|webp|svg)$/;
const imageLayer = (file: string) =>
  SAFE_FILE.test(file)
    ? `<image href="/avatar2d/${file}" x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}"/>`
    : '';

function vectorOrImage(
  item: AvatarItem | undefined,
  part: 'front' | 'back',
  vec: (c: Palette) => string,
  c: Palette,
): string {
  if (!item) return '';
  if (item.art.kind === 'image') {
    const f = part === 'back' ? item.art.back : item.art.file;
    return f ? imageLayer(f) : '';
  }
  return part === 'front' ? vec(c) : '';
}

/** กรอบซูมของรูปตัวอย่างไอเท็มแต่ละช่อง (x y w h ในพิกัด canvas) — ช่องที่ไม่ระบุ = เห็นทั้งตัว */
export const SLOT_FOCUS: Partial<Record<AvatarSlot, string>> = {
  hair: '30 0 240 230',
  hat: '30 0 240 200',
  glasses: '50 80 200 120',
  neck: '70 150 160 140',
  top: '50 170 200 160',
  bottom: '50 270 200 130',
  shoes: '60 320 180 90',
};

export interface RenderOptions {
  /** กรอบมองเฉพาะส่วน "x y w h" (ตัวเลขเท่านั้น) — ไม่ใส่ = ทั้ง canvas */
  viewBox?: string;
  /** ขนาดที่แสดง (px กว้าง) — ไม่ใส่ = ยืดตามกล่องแม่ */
  width?: number;
  /** ข้อความอธิบายสำหรับ screen reader */
  label?: string;
}

/** SVG ทั้งตัวของ look (สตริง) — ค่าสี/ไฟล์มาจากรายการที่กำหนดเท่านั้น */
export function renderAvatarSvg(look: AvatarLook, opts: RenderOptions = {}): string {
  const s = skinOf(look.skin);
  const h = hairOf(look.hairColor);
  const c: Palette = { skin: s.color, skinShade: s.shade, hair: h.color, hairShade: h.shade };
  const at = (slot: AvatarSlot) => {
    const id = look.items[slot];
    return id ? BY_ID.get(id) : undefined;
  };
  const hairItem = at('hair');
  const hairFns = hairItem ? hairParts[hairItem.id] : undefined;
  const [hairBack, hairFront] = hairFns ? hairFns(c) : ['', ''];
  const outfit = at('outfit');
  const pick = (slot: AvatarSlot, table: Record<string, (c: Palette) => string>) => {
    const item = at(slot);
    return vectorOrImage(item, 'front', (cc) => table[item!.id]?.(cc) ?? '', c);
  };
  const t = (tab: Record<string, () => string>) =>
    Object.fromEntries(Object.entries(tab).map(([k, f]) => [k, () => f()])) as Record<
      string,
      (c: Palette) => string
    >;

  const hairBackLayer =
    hairItem?.art.kind === 'image' ? vectorOrImage(hairItem, 'back', () => '', c) : hairBack;
  const hairFrontLayer =
    hairItem?.art.kind === 'image' ? vectorOrImage(hairItem, 'front', () => '', c) : hairFront;
  const pet = at('companion');

  const layers = [
    hairBackLayer,
    bodyLayer(c),
    pick('shoes', t(shoesParts)),
    outfit ? '' : pick('bottom', t(bottomParts)),
    outfit ? '' : pick('top', t(topParts)),
    outfit ? pick('outfit', t(outfitParts)) : '',
    pick('neck', t(neckParts)),
    hairFrontLayer,
    pick('glasses', t(glassesParts)),
    pick('hat', t(hatParts)),
    pick('hand', t(handParts)),
    pet
      ? vectorOrImage(pet, 'back', () => '', c) +
        vectorOrImage(pet, 'front', (cc) => companionParts[pet.id]?.(cc) ?? '', c)
      : '',
  ].join('');
  const vb =
    opts.viewBox && /^[\d.\s-]{3,40}$/.test(opts.viewBox)
      ? opts.viewBox
      : `0 0 ${CANVAS_W} ${CANVAS_H}`;
  const size = opts.width ? ` width="${opts.width}"` : '';
  const label = (opts.label ?? 'ตัวละคร').replace(/[<>&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${size} role="img" aria-label="${label}" style="display:block;height:auto;max-width:100%">${layers}</svg>`;
}

/**
 * ตัวละครแบบเลเยอร์พอดีตัว: ทุกชั้นเป็นภาพโปร่งใสขนาดเท่ากัน วางซ้อนที่ตำแหน่ง 0,0 ได้เลย (ไม่ต้องคำนวณตำแหน่ง)
 * ภาพอยู่ที่ /game/layers/<ตัวละคร>/{base,01..10,pet}.webp สร้างจาก design/game/layers_front.py
 * ตัวละครที่ยังไม่มีเลเยอร์ใช้ระบบวางตำแหน่งเดิม (lib/avatar.ts)
 */
export interface LayerSet {
  /** ขนาดภาพ (px) — ใช้หาอัตราส่วน */
  w: number;
  h: number;
  /** ลำดับซ้อนจากล่างขึ้นบน (รหัสไอเท็ม 01..10 หรือ 'pet') */
  order: string[];
}
export const LAYERS: Record<string, LayerSet> = {
  harry: {
    w: 509,
    h: 668,
    // เสื้อเชิ้ต → กั๊ก → เนคไท → กางเกง → รองเท้า → ชุดคลุม → ผ้าพันคอ → แว่น → ของถือ → สัตว์
    order: ['02', '03', '04', '05', '06', '01', '07', '08', '09', '10', 'pet'],
  },
};

export const hasLayers = (characterId: string): boolean => !!LAYERS[characterId];

/** รหัสชั้นของไอเท็ม (`harry-03` → `03`, สัตว์ `harry-pet` → `pet`) */
export const layerKey = (itemId: string): string => itemId.split('-')[1] ?? '';

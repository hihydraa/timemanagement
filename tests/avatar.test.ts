import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANDMARKS, canvasAspect, placeItem } from '../apps/web/src/lib/avatar';
import { CHARACTERS, ITEMS } from '../src/lib/game';

describe('สวมซ้อนบนตัวละคร (avatar)', () => {
  it('ทุกตัวละครมีจุดสังเกต + ภาพตัดพื้น + อัตราส่วน canvas', () => {
    for (const c of CHARACTERS) {
      expect(LANDMARKS[c.id], c.id).toBeTruthy();
      expect(existsSync(`apps/web/public/game/cut/characters/${c.id}.webp`), c.id).toBe(true);
      expect(canvasAspect(c.id)).toBeGreaterThan(0.4);
    }
  });
  it('ทุกไอเท็ม (ยกเว้นสัตว์) มีภาพตัดพื้น และวางบนทุกตัวละครได้ในกรอบ canvas พร้อมลำดับซ้อน', () => {
    for (const it of ITEMS.filter((i) => i.slot !== 'companion')) {
      expect(existsSync(`apps/web/public/game/cut/items/${it.id}.webp`), it.id).toBe(true);
      for (const c of CHARACTERS) {
        const b = placeItem(c.id, it.id)!;
        expect(b, `${c.id}/${it.id}`).toBeTruthy();
        expect(b.width).toBeGreaterThan(2);
        expect(b.height).toBeGreaterThan(2);
        expect(b.left).toBeGreaterThanOrEqual(-5);
        expect(b.left + b.width).toBeLessThanOrEqual(105);
        expect(b.top + b.height).toBeLessThanOrEqual(104);
        expect(b.z).toBeGreaterThan(0);
      }
    }
  });
  it('สัตว์ประจำตัวไม่ถูกวางซ้อน (แสดงเป็นป้าย) และตัวละคร/ไอเท็มที่ไม่มี = null', () => {
    expect(placeItem('harry', 'harry-pet')).toBeNull();
    expect(placeItem('nobody', 'harry-01')).toBeNull();
    expect(placeItem('harry', 'nope')).toBeNull();
  });
  it('ลำดับซ้อน: เสื้อนอกอยู่เหนือเสื้อ, หมวก/แว่นอยู่บนสุด', () => {
    const z = (id: string) => placeItem('harry', id)!.z;
    expect(z('harry-01')).toBeGreaterThan(z('harry-02')); // robe > shirt
    expect(z('harry-08')).toBeGreaterThan(z('harry-01')); // glasses > robe
    expect(z('harry-05')).toBeLessThan(z('harry-02')); // trousers < shirt
  });
});

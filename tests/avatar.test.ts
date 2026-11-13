import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RIGS,
  SPECS,
  canvasAspect,
  placeItem,
  placeItems,
  placePet,
} from '../apps/web/src/lib/avatar';
import { LAYERS, hasLayers, layerKey } from '../apps/web/src/lib/layers';
import { CHARACTERS, ITEMS, getItem } from '../src/lib/game';

describe('สวมซ้อนบนตัวละคร (avatar)', () => {
  it('ทุกตัวละครมีจุดสังเกต + ภาพตัดพื้น + อัตราส่วน canvas', () => {
    for (const c of CHARACTERS) {
      expect(RIGS[c.id], c.id).toBeTruthy();
      expect(SPECS[`${c.id}-pet`], c.id).toBeTruthy();
      expect(existsSync(`apps/web/public/game/cut/characters/${c.id}.webp`), c.id).toBe(true);
      expect(canvasAspect(c.id)).toBeGreaterThan(0.4);
    }
  });
  it('ทุกไอเท็ม (ยกเว้นสัตว์) มีภาพตัดพื้น + ตำแหน่ง และวางบนตัวละครของตัวเองได้ในกรอบ canvas พร้อมลำดับซ้อน', () => {
    for (const it of ITEMS.filter((i) => i.slot !== 'companion')) {
      expect(existsSync(`apps/web/public/game/cut/items/${it.id}.webp`), it.id).toBe(true);
      const boxes = placeItems(it.collection, it.id);
      expect(boxes.length, it.id).toBeGreaterThan(0);
      for (const b of boxes) {
        expect(b.width, it.id).toBeGreaterThan(2);
        expect(b.cx, it.id).toBeGreaterThan(-10);
        expect(b.cx, it.id).toBeLessThan(110);
        expect(b.cy, it.id).toBeGreaterThan(-5);
        expect(b.cy, it.id).toBeLessThan(105);
        expect(b.z).toBeGreaterThan(0);
      }
    }
  });
  it('สัตว์ประจำตัวทุกตัวมีภาพตัดพื้นและตำแหน่ง (บนไหล่/ข้างเท้า)', () => {
    for (const c of CHARACTERS) {
      expect(existsSync(`apps/web/public/game/cut/companions/${c.id}.webp`), c.id).toBe(true);
      expect(placePet(c.id), c.id).toBeTruthy();
    }
    expect(placePet('nobody')).toBeNull();
  });
  it('ถุงมือแยกเป็น 2 ข้าง (ซ้าย/ขวา) ที่มือ; ไม้กายสิทธิ์หมุนถือที่มือซ้าย; เนคไทอยู่ใต้ผ้าพันคอ', () => {
    const g = placeItems('draco', 'draco-08');
    expect(g.map((b) => b.crop)).toEqual(['left', 'right']);
    expect(g[0]!.cx).toBeLessThan(g[1]!.cx);
    expect(placeItem('hermione', 'hermione-09')!.rotate).toBe(180);
    expect(placeItem('harry', 'harry-09')!.flip).toBe(true);
    expect(placeItem('harry', 'harry-04')!.z).toBeLessThan(placeItem('harry', 'harry-07')!.z); // tie < scarf
  });
  it('สัตว์ประจำตัวไม่ถูกวางซ้อนเป็นไอเท็ม และตัวละคร/ไอเท็มที่ไม่มี = null', () => {
    expect(placeItem('harry', 'harry-pet')).toBeNull(); // สัตว์ใช้ placePet
    expect(placeItem('nobody', 'harry-01')).toBeNull();
    expect(placeItem('harry', 'nope')).toBeNull();
  });
  it('ลำดับซ้อน: เสื้อนอกอยู่เหนือเสื้อ, หมวก/แว่นอยู่บนสุด', () => {
    const z = (id: string) => placeItem('harry', id)!.z;
    expect(z('harry-01')).toBeGreaterThan(z('harry-02')); // robe > shirt
    expect(z('harry-08')).toBeGreaterThan(z('harry-01')); // glasses > robe
    expect(z('harry-05')).toBeLessThan(z('harry-02')); // trousers < shirt
  });
  it('เสื้อเชิ้ต (shirt) กับเสื้อกั๊ก/สเวตเตอร์ (top) อยู่คนละช่อง สวมซ้อนกันได้', () => {
    expect(getItem('harry-02')!.slot).toBe('shirt');
    expect(getItem('harry-03')!.slot).toBe('top');
    expect(placeItem('harry', 'harry-02')!.z).toBeLessThan(placeItem('harry', 'harry-03')!.z);
  });
  it('แฮร์รี่ใช้เลเยอร์พอดีตัว: ไฟล์ครบ ทุกไอเท็ม/สัตว์ของเขามีชั้น และลำดับซ้อนไม่ซ้ำ', () => {
    expect(hasLayers('harry')).toBe(true);
    expect(hasLayers('ron')).toBe(false); // ยังไม่มีเลเยอร์ → ใช้ระบบวางตำแหน่งเดิม
    const set = LAYERS.harry!;
    expect(existsSync('apps/web/public/game/layers/harry/base.webp')).toBe(true);
    for (const k of set.order)
      expect(existsSync(`apps/web/public/game/layers/harry/${k}.webp`), k).toBe(true);
    const mine = ITEMS.filter((i) => i.collection === 'harry').map((i) => layerKey(i.id));
    expect([...mine].sort()).toEqual([...set.order].sort());
    expect(new Set(set.order).size).toBe(set.order.length);
    const at = (k: string) => set.order.indexOf(k);
    expect(at('02')).toBeLessThan(at('03')); // เชิ้ต < กั๊ก
    expect(at('03')).toBeLessThan(at('01')); // กั๊ก < ชุดคลุม
    expect(at('01')).toBeLessThan(at('07')); // ชุดคลุม < ผ้าพันคอ
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Quick Add ใช้ parser ตัวเดียวกับ LINE (ไม่เขียนซ้ำ)', () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  it('ฝั่งเว็บ (Quick Add) และ LINE import ฟังก์ชัน parseTask จากไฟล์เดียวกัน src/services/parser.ts', () => {
    const web = src('../apps/web/src/lib/quickAdd.ts');
    const line = src('../src/services/lineBot.ts');
    expect(web).toMatch(/from '\.\.\/\.\.\/\.\.\/\.\.\/src\/services\/parser'/);
    expect(line).toMatch(/from '\.\/parser'/);
    expect(web).toMatch(/parseTask/);
    expect(line).toMatch(/parseTask/);
  });
  it('ไม่มีสำเนา parser อยู่ใน apps/web', () => {
    expect(() => readFileSync(new URL('../apps/web/src/lib/parser.ts', import.meta.url))).toThrow();
  });
});

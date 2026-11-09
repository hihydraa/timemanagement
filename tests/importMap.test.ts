import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planImport } from '../apps/web/src/lib/importMap';
import { excelDate, readXlsx } from '../apps/web/src/lib/xlsx';

const load = async () => {
  const b = readFileSync('tests/fixtures/sample-tasks.xlsx');
  return readXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};

describe('อ่าน xlsx + แปลงแม่แบบ Task Management', () => {
  it('อ่านชีต ข้อความ (รวมอักขระพิเศษ) ตัวเลข และบูลีน', async () => {
    const s = await load();
    expect(s.map((x) => x.name)).toEqual(['Jane', 'AllTaskรวม', 'Setting']);
    expect(s[0]!.rows[15]![1]).toBe('ส่งรายงาน & ทบทวน <A>');
    expect(s[0]!.rows[15]![6]).toBe(true);
  });
  it('แปลงเป็นงานตามกติกา และข้ามชีตที่ไม่มีตาราง', async () => {
    const plans = planImport(await load(), '2026-11-09');
    expect(plans.map((p) => p.name)).toEqual(['Jane', 'AllTaskรวม']);
    expect(plans[1]!.aggregate).toBe(true);
    expect(plans[0]!.aggregate).toBe(false);
    const [done, doing, none, cancel] = plans[0]!.tasks;
    expect(done).toMatchObject({
      title: 'ส่งรายงาน & ทบทวน <A>',
      status: 'done',
      dueDate: '2025-03-03',
      description: 'รายละเอียด\nหมายเหตุ: ส่งแล้ว',
      completedAt: '2025-03-03T05:00:00.000Z',
      tags: ['Jane'],
    });
    expect(doing).toMatchObject({
      status: 'doing',
      dueDate: '2025-03-06',
      description: 'เริ่ม: 01/03/2025',
    });
    expect(none).toMatchObject({ status: 'todo', dueDate: null, completedAt: null });
    expect(cancel).toMatchObject({ status: 'cancelled', dueDate: '2026-07-01' });
  });
  it('excelDate', () => {
    expect(excelDate(45719)).toBe('2025-03-03');
    expect(excelDate(5)).toBeNull();
  });
  it('ไฟล์ที่ไม่ใช่ xlsx → error ภาษาไทย', async () => {
    await expect(readXlsx(new TextEncoder().encode('hello').buffer as ArrayBuffer)).rejects.toThrow(
      /Excel/,
    );
  });
});

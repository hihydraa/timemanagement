import { describe, expect, it } from 'vitest';
import { deadlineYmd, heatLevel, monthGrid, monthTitle, shiftMonth, trend } from '../apps/web/src/lib/dashboard';

describe('lib/dashboard', () => {
  it('shiftMonth ข้ามปี', () => {
    expect(shiftMonth('2026-11', 1)).toBe('2026-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-03', -14)).toBe('2025-01');
  });
  it('monthTitle เป็น พ.ศ.', () => expect(monthTitle('2026-11')).toBe('พ.ย. 2569'));
  it('monthGrid: เริ่มจันทร์, 7 ช่องต่อแถว, ครบทุกวัน', () => {
    const g = monthGrid('2026-11'); // 1 พ.ย. 2026 = อาทิตย์
    expect(g.every((r) => r.length === 7)).toBe(true);
    expect(g[0]!.filter((c) => c.ymd).map((c) => c.ymd)).toEqual(['2026-11-01']); // อาทิตย์เป็นช่องสุดท้ายของแถวแรก
    expect(g[0]![6]!.day).toBe(1);
    expect(g.flat().filter((c) => c.ymd)).toHaveLength(30);
    const feb = monthGrid('2026-02'); // 1 ก.พ. 2026 = อาทิตย์, 28 วัน
    expect(feb.flat().filter((c) => c.ymd)).toHaveLength(28);
    expect(monthGrid('2024-02').flat().filter((c) => c.ymd)).toHaveLength(29);
    expect(monthGrid('2026-06')[0]![0]!.ymd).toBe('2026-06-01'); // จันทร์
  });
  it('heatLevel / trend / deadlineYmd', () => {
    expect([0, 1, 2, 3, 4, 9].map(heatLevel)).toEqual([0, 1, 2, 2, 3, 3]);
    expect(trend(5, 3)).toEqual({ arrow: '▲', diff: 2 });
    expect(trend(1, 3)).toEqual({ arrow: '▼', diff: 2 });
    expect(trend(2, 2)).toEqual({ arrow: '＝', diff: 0 });
    expect(deadlineYmd({ dueAt: '2026-11-30T17:30:00.000Z', dueDate: null })).toBe('2026-12-01');
    expect(deadlineYmd({ dueAt: null, dueDate: '2026-11-05' })).toBe('2026-11-05');
  });
});

import { describe, expect, it } from 'vitest';
import { celebrateText } from '../apps/web/src/lib/dobbyCelebrate';

const v = { you: 'แฮม', dobby: 'ด็อบ', tone: 'playful' as const };
const first = () => 0;

describe('celebrateText', () => {
  it('งานที่เพิ่ม → ข้อความ created', () => {
    expect(celebrateText({ kind: 'create' }, v, null, first)).toContain('จดแล้ว');
  });
  it('งานสุดท้ายของวัน (มีงานเสร็จก่อนหน้า) → all_clear', () => {
    const t = celebrateText(
      { kind: 'complete', importance: 1 },
      v,
      { open: 1, doneToday: 2 },
      first,
    );
    expect(t).toContain('เคลียร์หมดแล้ว');
  });
  it('งานสำคัญ → complete_important', () => {
    const t = celebrateText(
      { kind: 'complete', importance: 4 },
      v,
      { open: 5, doneToday: 0 },
      first,
    );
    expect(t).toContain('งานสำคัญ');
  });
  it('งานแรกของวัน → complete_first', () => {
    const t = celebrateText(
      { kind: 'complete', importance: 1 },
      v,
      { open: 5, doneToday: 0 },
      first,
    );
    expect(t).toContain('งานแรก');
  });
  it('ไม่มีข้อมูลสถานการณ์ก็ยังพูดได้ และใช้ชื่อที่ตั้ง', () => {
    const t = celebrateText(
      { kind: 'voice', voice: 'level_up', ctx: { level: 3 } },
      v,
      null,
      first,
    );
    expect(t).toContain('3');
    expect(t).toContain('แฮม');
  });
});

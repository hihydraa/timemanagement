import { describe, expect, it } from 'vitest';
import { taskCard } from '../src/services/flex';
import type { TaskDto } from '../src/services/tasks';

const task = {
  id: 't1',
  title: 'ประชุม',
  urgency: 3,
  importance: 2,
  tags: [],
  status: 'todo',
  allDay: false,
  startAt: '2026-11-05T02:00:00.000Z',
  endAt: '2026-11-05T10:00:00.000Z',
  dueAt: null,
  dueDate: null,
  estimateMinutes: null,
  recurrenceRule: null,
} as unknown as TaskDto;

describe('Flex: การ์ดยืนยันงาน', () => {
  it('ปุ่ม "เสร็จ" เต็มความกว้างแยกแถว ไม่ถูกบีบเป็น 3 ปุ่มแนวนอน (ข้อความไม่ถูกตัด)', () => {
    const m = taskCard(task, { baseUrl: 'https://d.example.com' }) as unknown as {
      contents: {
        footer: { layout: string; contents: { type: string; action?: { label: string } }[] };
      };
    };
    const f = m.contents.footer;
    expect(f.layout).toBe('vertical');
    expect(f.contents[0]?.action?.label).toBe('✅ เสร็จ');
    expect(f.contents[1]?.type).toBe('box');
  });
});

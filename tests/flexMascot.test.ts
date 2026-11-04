import { describe, expect, it } from 'vitest';
import { eveningCard, listCard } from '../src/services/flex';
import type { TaskDto } from '../src/services/tasks';

const task = {
  id: 't1',
  title: 'งาน',
  urgency: 2,
  importance: 2,
  tags: [],
  status: 'todo',
} as unknown as TaskDto;
const hero = (m: unknown) => (m as { contents: { hero?: { url: string } } }).contents.hero;

describe('Flex: มาสคอต Dobby บนหัวการ์ด', () => {
  it('ใส่ภาพเมื่อ APP_BASE_URL เป็น https และเลือกท่าตามบริบท', () => {
    const l = listCard(
      'วันนี้',
      [{ title: 'x', tasks: [task] }],
      'https://d.example.com/',
      'morning',
    );
    expect(hero(l.message)?.url).toBe('https://d.example.com/mascot/morning.png');
    expect(
      hero(eveningCard('2026-11-04', [task], [], 0, 'https://d.example.com').message)?.url,
    ).toMatch(/done\.png$/);
    expect(
      hero(eveningCard('2026-11-04', [], [task], 0, 'https://d.example.com').message)?.url,
    ).toMatch(/rest\.png$/);
  });
  it('ไม่ใส่ภาพเมื่อไม่ใช่ https (LINE ดึงภาพ localhost ไม่ได้) หรือไม่ระบุท่า', () => {
    expect(
      hero(
        listCard('x', [{ title: 'x', tasks: [task] }], 'http://localhost:5173', 'morning').message,
      ),
    ).toBeUndefined();
    expect(
      hero(listCard('x', [{ title: 'x', tasks: [task] }], 'https://d.example.com').message),
    ).toBeUndefined();
    expect(
      hero(eveningCard('2026-11-04', [task], [], 0, 'http://localhost:5173').message),
    ).toBeUndefined();
  });
});

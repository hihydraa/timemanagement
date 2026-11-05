import { describe, expect, it } from 'vitest';
import { movedPatch } from '../apps/web/src/lib/matrix';
import { restorePayload, canUndoDelete } from '../apps/web/src/lib/undo';
import type { Task } from '../apps/web/src/lib/types';

const base = { urgency: 1, importance: 2, allDay: true, startAt: null, dueAt: null };
describe('Matrix → เสนอเดดไลน์', () => {
  it('ไปฝั่งด่วน = เดดไลน์วันนี้', () => {
    expect(movedPatch(base, { urgent: true, important: false }, '2026-11-05')).toEqual({
      allDay: true,
      dueDate: '2026-11-05',
    });
  });
  it('ไปฝั่งไม่ด่วน = อีก 5 วัน, ข้ามเฉพาะแกนที่เปลี่ยน', () => {
    expect(
      movedPatch(
        { ...base, urgency: 4, importance: 4 },
        { urgent: false, important: true },
        '2026-11-05',
      ),
    ).toEqual({ allDay: true, dueDate: '2026-11-10' });
  });
  it('งานมีเวลา → ตั้ง dueAt 23:59 เวลาไทย, ไม่แตะเวลาเริ่ม', () => {
    const p = movedPatch(
      { ...base, allDay: false, startAt: '2026-11-08T03:00:00.000Z' },
      { urgent: true, important: true },
      '2026-11-05',
    );
    expect(p).toEqual({ importance: 4, dueAt: '2026-11-04T16:59:00.000Z' });
  });
  it('อยู่ช่องเดิมแล้ว = ไม่มีอะไรเปลี่ยน', () => {
    expect(
      movedPatch(
        { ...base, urgency: 3, importance: 3 },
        { urgent: true, important: true },
        '2026-11-05',
      ),
    ).toEqual({});
  });
});
describe('undo ลบ', () => {
  const t = {
    id: 'a',
    title: 'x',
    description: '',
    categoryId: null,
    urgency: 3,
    importance: 4,
    status: 'todo',
    allDay: true,
    startAt: null,
    endAt: null,
    dueAt: null,
    dueDate: '2026-11-05',
    estimateMinutes: null,
    tags: ['a'],
    attachmentCount: 0,
    subtaskTotal: 0,
    subtaskDone: 0,
    parentTaskId: null,
    recurrenceId: null,
    recurrenceRule: null,
    gcalSync: false,
    gcalEventId: null,
    gcalSyncedAt: null,
    completedAt: null,
    snoozeCount: 0,
  } as Task;
  it('กู้ได้เฉพาะงานที่ไม่มีไฟล์/subtask/ซีรีส์', () => {
    expect(canUndoDelete(t)).toBe(true);
    expect(canUndoDelete({ ...t, attachmentCount: 1 })).toBe(false);
    expect(canUndoDelete({ ...t, subtaskTotal: 2 })).toBe(false);
    expect(canUndoDelete({ ...t, recurrenceRule: 'FREQ=DAILY' })).toBe(false);
  });
  it('payload ไม่ส่ง urgency/id', () => {
    const p = restorePayload(t);
    expect(p).not.toHaveProperty('urgency');
    expect(p).not.toHaveProperty('id');
    expect(p.tags).toEqual(['a']);
  });
});

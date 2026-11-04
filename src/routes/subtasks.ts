import { Hono } from 'hono';
import { getDb } from '../db/client';
import { parseJson } from '../lib/http';
import { ensureReal, isVirtualId, parseVirtualId } from '../services/series';
import {
  addSubtask,
  deleteSubtask,
  listSubtasks,
  subtaskInput,
  subtaskPatch,
  updateSubtask,
} from '../services/subtasks';
import { getOwned } from '../services/tasks';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();

/** รายการย่อยของงาน; instance เสมือนของงานทำซ้ำคืนรายการของงานแม่เป็นแม่แบบ (template: true, ยังไม่ติ๊ก) */
r.get('/tasks/:id/subtasks', async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  const row = await getOwned(db, userId, c.req.param('id'));
  if (isVirtualId(row.id)) {
    const parentId = parseVirtualId(row.id)!.parentId;
    const tpl = (await listSubtasks(db, userId, parentId)).map((s) => ({ ...s, done: false }));
    return c.json({ subtasks: tpl, template: true });
  }
  return c.json({ subtasks: await listSubtasks(db, userId, row.id), template: false });
});

/** เพิ่มรายการย่อย (ถ้าเป็น instance เสมือนจะสร้างแถวจริงก่อน — คืน taskId จริงกลับมา) */
r.post('/tasks/:id/subtasks', async (c) => {
  const body = await parseJson(c, subtaskInput);
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  await getOwned(db, userId, c.req.param('id'));
  const taskId = await ensureReal(db, userId, c.req.param('id'));
  return c.json({ subtask: await addSubtask(db, userId, taskId, body.title), taskId }, 201);
});

r.patch('/subtasks/:id', async (c) => {
  const body = await parseJson(c, subtaskPatch);
  return c.json({
    subtask: await updateSubtask(getDb(c.env.DB), c.get('userId'), c.req.param('id'), body),
  });
});

r.delete('/subtasks/:id', async (c) => {
  await deleteSubtask(getDb(c.env.DB), c.get('userId'), c.req.param('id'));
  return c.json({ ok: true });
});

export default r;

import { Hono } from 'hono';
import { getDb } from '../db/client';
import { parseJson } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { importInput, importTasks } from '../services/importTasks';
import { taskLimit } from '../services/tasks';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();

/** POST /api/import/tasks — นำเข้างานจากไฟล์เก่า (หน้าเว็บอ่าน Excel แล้วส่งรายการที่แปลงแล้วมา) */
r.post(
  '/import/tasks',
  rateLimit({ scope: 'import', limit: 20, windowSec: 3600, key: (c) => c.get('userId') }),
  async (c) => {
    const body = await parseJson(c, importInput);
    return c.json(await importTasks(getDb(c.env.DB), c.get('userId'), body, taskLimit(c.env)));
  },
);

export default r;

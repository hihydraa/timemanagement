import { Hono } from 'hono';
import { getDb } from '../db/client';
import { parseJson } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { buyAvatarItem, buyInput, getAvatar2d, lookInput, saveLook } from '../services/avatar2d';
import type { AppEnv } from '../types';

/** ตัวละคร 2D แบบชั้นภาพ: ดูสถานะ / บันทึกหน้าตา / ซื้อไอเท็ม (ใช้แต้มจากการทำงานเสร็จ) */
const r = new Hono<AppEnv>();
const limit = rateLimit({
  scope: 'avatar2d',
  limit: 90,
  windowSec: 600,
  key: (c) => c.get('userId'),
});

r.get('/avatar2d', async (c) => c.json(await getAvatar2d(getDb(c.env.DB), c.get('userId'))));
r.put('/avatar2d/look', limit, async (c) => {
  const look = await parseJson(c, lookInput);
  return c.json(await saveLook(getDb(c.env.DB), c.get('userId'), look));
});
r.post('/avatar2d/buy', limit, async (c) => {
  const { itemId } = await parseJson(c, buyInput);
  return c.json(await buyAvatarItem(getDb(c.env.DB), c.get('userId'), itemId));
});

export default r;

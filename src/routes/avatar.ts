import { Hono } from 'hono';
import { getDb } from '../db/client';
import { parseJson } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { z } from 'zod';
import {
  avatarInput,
  avatarShop,
  getAvatar,
  saveAvatar,
  unlockAvatarItem,
} from '../services/avatar';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();

r.get('/avatar', async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  return c.json({ avatar: await getAvatar(db, userId), ...(await avatarShop(db, userId)) });
});

const limit = rateLimit({
  scope: 'avatar',
  limit: 60,
  windowSec: 600,
  key: (c) => c.get('userId'),
});
r.put('/avatar', limit, async (c) => {
  const input = await parseJson(c, avatarInput);
  return c.json({ avatar: await saveAvatar(getDb(c.env.DB), c.get('userId'), input) });
});

const unlockInput = z.object({ kind: z.enum(['hair', 'outfit']), id: z.string().max(40) }).strict();
r.post('/avatar/unlock', limit, async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  const { kind, id } = await parseJson(c, unlockInput);
  await unlockAvatarItem(db, userId, kind, id);
  return c.json(await avatarShop(db, userId));
});

export default r;

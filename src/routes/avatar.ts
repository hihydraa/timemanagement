import { Hono } from 'hono';
import { getDb } from '../db/client';
import { parseJson } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { avatarInput, getAvatar, saveAvatar } from '../services/avatar';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();

r.get('/avatar', async (c) =>
  c.json({ avatar: await getAvatar(getDb(c.env.DB), c.get('userId')) }),
);

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

export default r;

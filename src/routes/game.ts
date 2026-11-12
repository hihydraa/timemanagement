import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import { parseJson } from '../lib/http';
import { rateLimit } from '../lib/rateLimit';
import { buy, equip, getState, profileInput, saveProfile } from '../services/game';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();
const itemBody = z.object({ itemId: z.string().min(1).max(40) }).strict();

r.get('/game', async (c) => c.json(await getState(getDb(c.env.DB), c.get('userId'))));

r.put('/game/profile', async (c) => {
  const db = getDb(c.env.DB);
  await saveProfile(db, c.get('userId'), await parseJson(c, profileInput));
  return c.json(await getState(db, c.get('userId')));
});

const limit = rateLimit({ scope: 'game', limit: 60, windowSec: 600, key: (c) => c.get('userId') });
r.post('/game/buy', limit, async (c) => {
  const db = getDb(c.env.DB);
  await buy(db, c.get('userId'), (await parseJson(c, itemBody)).itemId);
  return c.json(await getState(db, c.get('userId')));
});
r.post('/game/equip', limit, async (c) => {
  const db = getDb(c.env.DB);
  const b = await parseJson(c, itemBody.extend({ equipped: z.boolean() }).strict());
  await equip(db, c.get('userId'), b.itemId, b.equipped);
  return c.json(await getState(db, c.get('userId')));
});

export default r;

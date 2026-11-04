import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { getDb } from './db/client';
import { users } from './db/schema';
import { ApiError, errorBody } from './lib/http';
import { originCheck, requireAuth } from './middleware';
import auth from './routes/auth';
import categoriesRoutes from './routes/categories';
import tasksRoutes from './routes/tasks';
import type { AppEnv } from './types';
import { nowIso } from './lib/time';

export const app = new Hono<AppEnv>();

app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // FullCalendar inject style
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
    referrerPolicy: 'strict-origin-when-cross-origin',
    xContentTypeOptions: 'nosniff',
  }),
);

app.get('/api/health', (c) => c.json({ ok: true, name: 'dobby', time: nowIso() }));

app.route('/auth', auth);

const api = new Hono<AppEnv>();
api.use('*', originCheck, requireAuth);
api.get('/me', async (c) => {
  const u = await getDb(c.env.DB)
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, c.get('userId')))
    .get();
  if (!u) throw new ApiError(401, 'unauthorized', 'กรุณาเข้าสู่ระบบ');
  return c.json({ user: u });
});
api.route('/', tasksRoutes);
api.route('/', categoriesRoutes);
app.route('/api', api);

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json(errorBody(err.code, err.message), err.status);
  console.error('unhandled error', err.message);
  return c.json(errorBody('internal_error', 'เกิดข้อผิดพลาดภายในระบบ'), 500);
});

app.notFound((c) => {
  const p = c.req.path;
  if (p.startsWith('/api/') || p.startsWith('/auth/') || p.startsWith('/webhook/')) {
    return c.json(errorBody('not_found', 'ไม่พบเส้นทางนี้'), 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { getDb } from './db/client';
import { users } from './db/schema';
import { ApiError, errorBody } from './lib/http';
import { originCheck, requireAuth } from './middleware';
import attachmentsRoutes from './routes/attachments';
import auth from './routes/auth';
import categoriesRoutes from './routes/categories';
import gcalRoutes from './routes/gcal';
import { lineApi, lineWebhook } from './routes/line';
import tasksRoutes from './routes/tasks';
import type { AppEnv } from './types';
import { nowIso } from './lib/time';

export const app = new Hono<AppEnv>();

const baseSecureHeaders = secureHeaders({
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
});

// ไฟล์ดาวน์โหลดตั้ง CSP แบบ sandbox + nosniff เอง (ดู routes/attachments.ts) จึงไม่ให้ global CSP ทับ
const isDownload = (path: string) => /^\/api\/attachments\/[^/]+$/.test(path);
app.use('*', async (c, next) => {
  if (isDownload(c.req.path) && c.req.method === 'GET') {
    await next();
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return;
  }
  return baseSecureHeaders(c, next);
});

app.get('/api/health', (c) => c.json({ ok: true, name: 'dobby', time: nowIso() }));

app.route('/auth', auth);
app.route('/webhook/line', lineWebhook);

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
api.route('/', attachmentsRoutes);
api.route('/line', lineApi);
api.route('/gcal', gcalRoutes);
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

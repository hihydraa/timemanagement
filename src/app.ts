import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { getDb } from './db/client';
import { users } from './db/schema';
import { ApiError, errorBody } from './lib/http';
import { originCheck, requireAuth } from './middleware';
import { readSessionCookie, verifySession } from './lib/session';
import attachmentsRoutes from './routes/attachments';
import auth from './routes/auth';
import categoriesRoutes from './routes/categories';
import exportRoutes from './routes/export';
import focusRoutes from './routes/focus';
import gcalRoutes from './routes/gcal';
import { lineApi, lineWebhook } from './routes/line';
import { legal } from './routes/legal';
import settingsRoutes from './routes/settings';
import statsRoutes from './routes/stats';
import subtasksRoutes from './routes/subtasks';
import accountRoutes from './routes/account';
import importRoutes from './routes/importTasks';
import pushRoutes from './routes/push';
import alarmRoutes from './routes/alarms';
import tasksRoutes from './routes/tasks';
import type { AppEnv } from './types';
import { nowIso } from './lib/time';

export const app = new Hono<AppEnv>();

// ต้องตรงกับ apps/web/public/_headers (ของไฟล์ static) — ตรวจโดย tests/headers.test.ts
const baseSecureHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"], // FullCalendar inject style
    imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    manifestSrc: ["'self'"],
    workerSrc: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
  },
  referrerPolicy: 'strict-origin-when-cross-origin',
  xContentTypeOptions: 'nosniff',
  xFrameOptions: 'DENY',
  permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [], usb: [] },
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

/**
 * สถานะ session แบบสาธารณะ: ตอบ 200 เสมอ ({ user: null } ถ้ายังไม่ล็อกอิน)
 * ให้หน้าเว็บเช็คได้โดยไม่เกิด 401 ใน console; ไม่เปิดเผยข้อมูลอื่นนอกจากของเจ้าของ session
 */
app.get('/api/session', async (c) => {
  const token = readSessionCookie(c);
  const userId = token ? await verifySession(c.env, token) : null;
  const u = userId
    ? await getDb(c.env.DB)
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .get()
    : undefined;
  c.header('Cache-Control', 'no-store');
  return c.json({ user: u ?? null });
});

app.route('/', legal);
app.route('/auth', auth);
app.route('/webhook/line', lineWebhook);

const api = new Hono<AppEnv>();
// JSON ของ API เล็กเสมอ (รายละเอียดงาน ≤ 5,000 ตัวอักษร): จำกัด 256 KB; การอัปโหลดไฟล์มีเพดานของตัวเอง
const isUpload = (method: string, path: string) =>
  method === 'POST' && /^\/api\/tasks\/[^/]+\/attachments$/.test(path);
const jsonLimit = bodyLimit({
  maxSize: 256 * 1024,
  onError: (c) => c.json(errorBody('request_too_large', 'ขนาดคำขอใหญ่เกินกำหนด'), 413),
});
api.use('*', (c, next) => (isUpload(c.req.method, c.req.path) ? next() : jsonLimit(c, next)));
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
api.route('/', accountRoutes);
api.route('/', importRoutes);
api.route('/', pushRoutes);
api.route('/', alarmRoutes);
api.route('/', tasksRoutes);
api.route('/', categoriesRoutes);
api.route('/', attachmentsRoutes);
api.route('/line', lineApi);
api.route('/gcal', gcalRoutes);
api.route('/', settingsRoutes);
api.route('/', subtasksRoutes);
api.route('/', focusRoutes);
api.route('/', exportRoutes);
api.route('/', statsRoutes);
app.route('/api', api);

app.onError((err, c) => {
  if (err instanceof ApiError) {
    if (err.retryAfter) c.header('Retry-After', String(err.retryAfter));
    return c.json(errorBody(err.code, err.message), err.status);
  }
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

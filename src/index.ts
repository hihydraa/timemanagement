import { Hono } from 'hono';
import type { Env } from './types';
import { nowIso } from './lib/time';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true, name: 'dobby', time: nowIso() }));

app.onError((err, c) => {
  console.error('unhandled error', err.message);
  return c.json({ error: { code: 'internal_error', message: 'เกิดข้อผิดพลาดภายในระบบ' } }, 500);
});

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: { code: 'not_found', message: 'ไม่พบเส้นทางนี้' } }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
  // Phase 5: reminders / digest
  async scheduled(_event: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {},
} satisfies ExportedHandler<Env>;

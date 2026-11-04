import { app } from './app';
import { runNotifications } from './services/notifications';
import type { Env } from './types';

export default {
  fetch: app.fetch,
  /** Cron ทุก 5 นาที: เตือนก่อนเวลา / สรุปเช้า / เดดไลน์วันนี้ / สรุปเย็น (ดู services/notifications.ts) */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runNotifications(env).then(
        (r) => console.log('notifications run', JSON.stringify(r)),
        (e) => console.error('notifications failed', e instanceof Error ? e.message : 'unknown'),
      ),
    );
  },
} satisfies ExportedHandler<Env>;

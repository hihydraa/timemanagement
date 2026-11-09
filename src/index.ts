import { app } from './app';
import { getDb } from './db/client';
import { now } from './lib/time';
import { purgeRateLimits } from './lib/rateLimit';
import { runNotifications } from './services/notifications';
import { runWebNotifications } from './services/webNotifications';
import type { Env } from './types';

export default {
  fetch: app.fetch,
  /** Cron ทุก 5 นาที: เตือนก่อนเวลา / สรุปเช้า / เดดไลน์วันนี้ / สรุปเย็น (ดู services/notifications.ts) */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // ล้างตัวนับ rate limit ที่หมดอายุ ชั่วโมงละครั้ง (รอบแรกของทุกชั่วโมง)
    if (now().getUTCMinutes() < 5) {
      ctx.waitUntil(purgeRateLimits(getDb(env.DB)).catch(() => undefined));
    }
    ctx.waitUntil(
      runNotifications(env).then(
        (r) => console.log('notifications run', JSON.stringify(r)),
        (e) => console.error('notifications failed', e instanceof Error ? e.message : 'unknown'),
      ),
    );
    // แจ้งเตือนในเว็บ (Web Push) แยกจาก LINE: ไม่กินโควตา push ของ OA
    ctx.waitUntil(
      runWebNotifications(env).then(
        (r) => r.users && console.log('web notifications run', JSON.stringify(r)),
        (e) =>
          console.error('web notifications failed', e instanceof Error ? e.message : 'unknown'),
      ),
    );
  },
} satisfies ExportedHandler<Env>;

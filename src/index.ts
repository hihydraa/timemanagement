import { app } from './app';
import { getDb } from './db/client';
import { now } from './lib/time';
import { purgeRateLimits } from './lib/rateLimit';
import { runAlarms } from './services/alarms';
import { runNotifications } from './services/notifications';
import { runWebNotifications } from './services/webNotifications';
import type { Env } from './types';

const fail = (what: string) => (e: unknown) =>
  console.error(`${what} failed`, e instanceof Error ? e.message : 'unknown');

export default {
  fetch: app.fetch,
  /**
   * Cron ทุกนาที: นาฬิกาปลุก (query เดียวต่อรอบ) — และทุก 5 นาที: เตือนก่อนเวลา / สรุปเช้า / สรุปเย็น
   * (ดู services/alarms.ts, services/notifications.ts, services/webNotifications.ts)
   */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const minute = now().getUTCMinutes();
    ctx.waitUntil(
      runAlarms(env).then(
        (r) => (r.fired || r.repeated) && console.log('alarms run', JSON.stringify(r)),
        fail('alarms'),
      ),
    );
    if (minute % 5 !== 0) return; // งานแจ้งเตือนเดิมทำงานทุก 5 นาทีเหมือนเดิม
    // ล้างตัวนับ rate limit ที่หมดอายุ ชั่วโมงละครั้ง (รอบแรกของทุกชั่วโมง)
    if (minute < 5) {
      ctx.waitUntil(purgeRateLimits(getDb(env.DB)).catch(() => undefined));
    }
    ctx.waitUntil(
      runNotifications(env).then(
        (r) => console.log('notifications run', JSON.stringify(r)),
        fail('notifications'),
      ),
    );
    // แจ้งเตือนในเว็บ (Web Push) แยกจาก LINE: ไม่กินโควตา push ของ OA
    ctx.waitUntil(
      runWebNotifications(env).then(
        (r) => r.users && console.log('web notifications run', JSON.stringify(r)),
        fail('web notifications'),
      ),
    );
  },
} satisfies ExportedHandler<Env>;

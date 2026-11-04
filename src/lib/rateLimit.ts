import { sql } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { getDb, type Db } from '../db/client';
import { ApiError } from './http';
import { now } from './time';
import type { AppEnv } from '../types';

/**
 * Rate limit แบบเบา (fixed window) เก็บใน D1: 1 คำสั่ง upsert ต่อคำขอที่ถูกจำกัด
 * ใช้เฉพาะจุดเสี่ยง/ปริมาณต่ำ (login, webhook, ขอรหัสผูกบัญชี) เพื่อไม่ผลาญโควตาเขียนของ D1 ฟรี
 */
export interface Hit {
  ok: boolean;
  count: number;
  /** วินาทีที่ต้องรอก่อนลองใหม่ (เมื่อเกินเพดาน) */
  retryAfter: number;
}

export async function hit(db: Db, key: string, limit: number, windowSec: number): Promise<Hit> {
  const nowSec = Math.floor(now().getTime() / 1000);
  const start = Math.floor(nowSec / windowSec) * windowSec;
  const expires = start + windowSec;
  const rowKey = `${key}:${start}`;
  const row = await db.all<{ count: number }>(
    sql`insert into rate_limits (key, count, expires_at) values (${rowKey}, 1, ${new Date(expires * 1000).toISOString()})
        on conflict(key) do update set count = count + 1 returning count`,
  );
  const count = Number(row[0]?.count ?? 1);
  return { ok: count <= limit, count, retryAfter: Math.max(1, expires - nowSec) };
}

/** ลบแถวที่หมดอายุแล้ว (เรียกจาก cron เป็นระยะ) */
export async function purgeRateLimits(db: Db): Promise<void> {
  await db.run(
    sql`delete from rate_limits where expires_at < ${new Date(now().getTime()).toISOString()}`,
  );
}

export const clientIp = (c: { req: { header(n: string): string | undefined } }): string =>
  // CF-Connecting-IP ถูกตั้งโดย Cloudflare เอง (ปลอมจากฝั่ง client ไม่ได้เมื่อผ่าน Cloudflare)
  c.req.header('CF-Connecting-IP') ?? 'unknown';

interface Opts {
  scope: string;
  limit: number;
  windowSec: number;
  /** ค่าเริ่มต้น = IP ของผู้เรียก; ใส่ฟังก์ชันเพื่อจำกัดตามผู้ใช้ */
  key?: (c: Parameters<MiddlewareHandler<AppEnv>>[0]) => string;
}

export function rateLimit(o: Opts): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    let h: Hit | null = null;
    try {
      h = await hit(
        getDb(c.env.DB),
        `${o.scope}:${o.key ? o.key(c) : clientIp(c)}`,
        o.limit,
        o.windowSec,
      );
    } catch (e) {
      // ฐานข้อมูลมีปัญหา: เปิดทางผ่าน (ไม่ให้ระบบล่มเพราะตัวจำกัด) แต่ log ไว้
      console.error('rate limit unavailable', e instanceof Error ? e.message : 'unknown');
    }
    if (h && !h.ok) {
      throw new ApiError(
        429,
        'rate_limited',
        'คำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่',
        h.retryAfter,
      );
    }
    await next();
  };
}

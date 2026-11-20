import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { calendarFeeds } from '../db/schema';
import { nowIso } from '../lib/time';
import { gatherExport, toIcs } from './export';

const TOKEN_RE = /^[a-f0-9]{48}$/;

const newToken = (): string => {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

export interface FeedStatus {
  enabled: boolean;
  /** https://… (คัดลอกไปวางใน Google/Outlook ได้) */
  url: string | null;
  /** webcal://… (กดแล้วเปิด Apple Calendar บน iPhone/Mac เพื่อสมัครรับทันที) */
  webcalUrl: string | null;
}

export const feedUrl = (baseUrl: string, token: string): string =>
  `${baseUrl.replace(/\/$/, '')}/ics/${token}.ics`;

function status(baseUrl: string, token: string | null): FeedStatus {
  if (!token) return { enabled: false, url: null, webcalUrl: null };
  const url = feedUrl(baseUrl, token);
  return { enabled: true, url, webcalUrl: url.replace(/^https?:/, 'webcal:') };
}

export async function getFeed(db: Db, userId: string, baseUrl: string): Promise<FeedStatus> {
  const row = await db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, userId)).get();
  return status(baseUrl, row?.token ?? null);
}

/** สร้างลิงก์ใหม่ (ถ้ามีอยู่แล้วจะเปลี่ยน token — ลิงก์เก่าใช้ไม่ได้ทันที) */
export async function rotateFeed(db: Db, userId: string, baseUrl: string): Promise<FeedStatus> {
  const token = newToken();
  await db
    .insert(calendarFeeds)
    .values({ userId, token, createdAt: nowIso() })
    .onConflictDoUpdate({ target: calendarFeeds.userId, set: { token, createdAt: nowIso() } });
  return status(baseUrl, token);
}

export async function disableFeed(db: Db, userId: string): Promise<void> {
  await db.delete(calendarFeeds).where(eq(calendarFeeds.userId, userId));
}

/** ICS ของเจ้าของ token (null = token ไม่ถูกต้อง/ถูกปิด) */
export async function feedIcs(db: Db, token: string, baseUrl: string): Promise<string | null> {
  if (!TOKEN_RE.test(token)) return null;
  const row = await db.select().from(calendarFeeds).where(eq(calendarFeeds.token, token)).get();
  if (!row) return null;
  return toIcs(await gatherExport(db, row.userId), baseUrl);
}

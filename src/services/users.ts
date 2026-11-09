import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { categories, userSettings, users } from '../db/schema';
import { track } from './analytics';
import { nowIso } from '../lib/time';

export const DEFAULT_CATEGORIES = [
  { name: 'งาน', color: '#3b82f6' },
  { name: 'ส่วนตัว', color: '#a855f7' },
  { name: 'เรียน', color: '#14b8a6' },
  { name: 'สุขภาพ', color: '#22c55e' },
  { name: 'การเงิน', color: '#ca8a04' },
  { name: 'ครอบครัว', color: '#ec4899' },
];

/** ค่า ALLOWED_EMAILS ที่แปลว่า "เปิดสาธารณะ": ใครมีอีเมล Google ที่ยืนยันแล้วก็สมัครได้ (ยังถูกจำกัดด้วย MAX_USERS) */
export const OPEN_SIGNUP = '*';

export function isOpenSignup(allowed: string | undefined): boolean {
  return (allowed ?? '').split(',').some((s) => s.trim() === OPEN_SIGNUP);
}

export function isEmailAllowed(allowed: string, email: string): boolean {
  const list = allowed
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // ไม่ตั้งค่า = ไม่อนุญาตใครเลย (fail closed)
  if (list.includes(OPEN_SIGNUP)) return email.includes('@');
  return list.includes(email.toLowerCase());
}

/** เพดานจำนวนผู้ใช้: ตั้ง MAX_USERS เอง; โหมดเปิดสาธารณะที่ไม่ตั้งค่า ใช้ 50 (ปลอดภัยต่อโควตาฟรีของ Cloudflare/LINE) */
export const DEFAULT_OPEN_MAX_USERS = 50;
export function maxUsers(env: { ALLOWED_EMAILS?: string; MAX_USERS?: string }): number | null {
  const n = Number(env.MAX_USERS);
  if (Number.isInteger(n) && n > 0) return n;
  return isOpenSignup(env.ALLOWED_EMAILS) ? DEFAULT_OPEN_MAX_USERS : null;
}

/** ผู้ใช้เดิมเข้าได้เสมอ; ผู้สมัครใหม่ต้องไม่เกินเพดาน (คืน false = ระบบเต็ม) */
export async function canSignUp(
  db: Db,
  env: { ALLOWED_EMAILS?: string; MAX_USERS?: string },
  email: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .get();
  if (existing) return true;
  const cap = maxUsers(env);
  if (cap === null) return true;
  const n = await db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .get();
  return Number(n?.n ?? 0) < cap;
}

export async function upsertUser(
  db: Db,
  p: { email: string; name: string; googleSub: string | null },
): Promise<string> {
  const email = p.email.toLowerCase();
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    await db
      .update(users)
      .set({ name: p.name || existing.name, googleSub: p.googleSub ?? existing.googleSub })
      .where(eq(users.id, existing.id));
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db
    .insert(users)
    .values({ id, email, name: p.name, googleSub: p.googleSub, createdAt: nowIso() });
  await db.insert(userSettings).values({ userId: id, eveningReviewEnabled: 0 }); // สรุปเย็นปิดไว้ก่อน (เลือกเปิดเอง)
  await track(db, id, 'signup');
  await db.insert(categories).values(
    DEFAULT_CATEGORIES.map((c, i) => ({
      id: crypto.randomUUID(),
      userId: id,
      name: c.name,
      color: c.color,
      sortOrder: i,
    })),
  );
  return id;
}

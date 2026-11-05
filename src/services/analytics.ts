import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { usageEvents, userSettings, users } from '../db/schema';
import { bangkokDate, fromBangkok, now, nowIso } from '../lib/time';

/** เหตุการณ์ที่อนุญาต (ห้ามเก็บชื่องาน/รายละเอียด/ข้อความ — เก็บชื่อเหตุการณ์ + ค่าตัวเลข/หมวดสั้น ๆ เท่านั้น) */
export const EVENT_NAMES = [
  'signup',
  'first_task_created',
  'task_created',
  'task_completed',
  'morning_plan_opened',
  'auto_plan_previewed',
  'auto_plan_applied',
  'auto_plan_undone',
  'gcal_connected',
  'ui_mode_changed',
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** เหตุการณ์ที่เกิดได้ครั้งเดียวต่อผู้ใช้ */
const ONCE: ReadonlySet<EventName> = new Set(['signup', 'first_task_created', 'gcal_connected']);
/** เหตุการณ์ที่นับได้วันละครั้ง (เวลาไทย) */
const ONCE_PER_DAY: ReadonlySet<EventName> = new Set(['morning_plan_opened']);
/** เหตุการณ์ที่หน้าเว็บส่งเองได้ (ที่เหลือเซิร์ฟเวอร์บันทึกจากเหตุการณ์จริง) */
export const CLIENT_EVENTS: readonly EventName[] = ['morning_plan_opened'];

export type Props = Record<string, number | boolean | string>;
const SAFE_STR = /^[a-z0-9_]{1,24}$/;

/** props ต้องเป็นตัวเลข/boolean หรือสตริงหมวดสั้น ๆ (a-z0-9_ ≤ 24) เท่านั้น: อะไรที่เป็นข้อความอิสระถูกทิ้ง */
export function sanitizeProps(props: Record<string, unknown> | undefined): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (!/^[a-z0-9_]{1,24}$/.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v);
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && SAFE_STR.test(v)) out[k] = v;
  }
  return out;
}

/** บันทึกเหตุการณ์ (เงียบเมื่อผู้ใช้ opt-out หรือเกิดซ้ำตามกติกา) — ไม่ throw เพื่อไม่ให้กระทบงานหลัก */
export async function track(
  db: Db,
  userId: string,
  name: EventName,
  props?: Record<string, unknown>,
): Promise<boolean> {
  try {
    if (!EVENT_NAMES.includes(name)) return false;
    const s = await db
      .select({ o: userSettings.analyticsOptOut })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .get();
    if (s?.o === 1) return false;
    if (ONCE.has(name)) {
      const had = await db
        .select({ id: usageEvents.id })
        .from(usageEvents)
        .where(and(eq(usageEvents.userId, userId), eq(usageEvents.name, name)))
        .get();
      if (had) return false;
    } else if (ONCE_PER_DAY.has(name)) {
      const since = fromBangkok(bangkokDate(now())).toISOString();
      const had = await db
        .select({ id: usageEvents.id })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.userId, userId),
            eq(usageEvents.name, name),
            gte(usageEvents.createdAt, since),
          ),
        )
        .get();
      if (had) return false;
    }
    await db.insert(usageEvents).values({
      id: crypto.randomUUID(),
      userId,
      name,
      propsJson: JSON.stringify(sanitizeProps(props)),
      createdAt: nowIso(),
    });
    return true;
  } catch {
    return false;
  }
}

/** งานที่สร้างใหม่: บันทึก task_created และ first_task_created (พร้อมวินาทีนับจากสมัคร) */
export async function trackTaskCreated(
  db: Db,
  userId: string,
  source: 'web_quick' | 'web_form' | 'line',
): Promise<void> {
  await track(db, userId, 'task_created', { source });
  const u = await db.select({ c: users.createdAt }).from(users).where(eq(users.id, userId)).get();
  const secs = u ? Math.max(0, Math.round((now().getTime() - Date.parse(u.c)) / 1000)) : 0;
  await track(db, userId, 'first_task_created', { seconds_since_signup: secs, source });
}

/** ลบเหตุการณ์ทั้งหมดของผู้ใช้ (เมื่อ opt-out หรือลบบัญชี) */
export async function clearUsage(db: Db, userId: string): Promise<void> {
  await db.delete(usageEvents).where(eq(usageEvents.userId, userId));
}

export const countEvents = (db: Db, userId: string) =>
  db
    .select({ n: sql<number>`count(*)` })
    .from(usageEvents)
    .where(eq(usageEvents.userId, userId))
    .get();

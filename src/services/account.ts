import { eq, inArray, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  attachments,
  categories,
  focusSessions,
  lineLinkCodes,
  lineState,
  notificationLog,
  pushSubscriptions,
  reminders,
  subtasks,
  taskTags,
  tasks,
  usageEvents,
  userSettings,
  users,
} from '../db/schema';
import type { Env } from '../types';
import { disconnectGoogle } from './googleCalendar';

export interface DeleteAccountResult {
  files: number;
}

/**
 * ลบบัญชีและข้อมูลทั้งหมดของผู้ใช้ (ย้อนกลับไม่ได้):
 * ไฟล์แนบใน R2 → เพิกถอนสิทธิ์ Google + ลบ token → ข้อมูลทุกตารางที่ผูกกับผู้ใช้ (ในธุรกรรมเดียว) → ตัวผู้ใช้
 * หมายเหตุ: กิจกรรมที่เคยซิงก์ไปแล้วใน Google Calendar ของผู้ใช้ "ไม่ถูกลบ" (ผู้ใช้ลบเองใน Google ได้)
 */
export async function deleteAccount(
  env: Env,
  db: Db,
  userId: string,
): Promise<DeleteAccountResult> {
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return { files: 0 };

  // 1) ไฟล์ใน R2 (ลบเป็นชุดละ ≤ 1000 คีย์)
  const keys = (
    await db
      .select({ k: attachments.r2Key })
      .from(attachments)
      .where(eq(attachments.userId, userId))
  ).map((r) => r.k);
  for (let i = 0; i < keys.length; i += 1000) await env.FILES.delete(keys.slice(i, i + 1000));

  // 2) เพิกถอน Google (ไม่ล้มทั้งงานถ้า Google ไม่ตอบ) และลบ token
  await disconnectGoogle(env, db, userId);

  // 3) ฐานข้อมูล: ลบลูกก่อนแม่ ในชุดเดียว (atomic)
  const myTaskIds = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.userId, userId));
  await db.batch([
    db.delete(subtasks).where(inArray(subtasks.taskId, myTaskIds)),
    db.delete(taskTags).where(inArray(taskTags.taskId, myTaskIds)),
    // reminders ผูกกับ id งาน หรือ "<id แม่>~<วันที่>" ของครั้งเสมือน (id เป็น UUID 36 ตัวอักษร)
    db
      .delete(reminders)
      .where(
        or(
          inArray(reminders.taskId, myTaskIds),
          inArray(sql`substr(${reminders.taskId}, 1, 36)`, myTaskIds),
        ),
      ),
    db.delete(attachments).where(eq(attachments.userId, userId)),
    db.delete(focusSessions).where(eq(focusSessions.userId, userId)),
    db.delete(notificationLog).where(eq(notificationLog.userId, userId)),
    db.delete(lineLinkCodes).where(eq(lineLinkCodes.userId, userId)),
    ...(user.lineUserId
      ? [db.delete(lineState).where(eq(lineState.lineUserId, user.lineUserId))]
      : []),
    db.delete(tasks).where(eq(tasks.userId, userId)),
    db.delete(categories).where(eq(categories.userId, userId)),
    db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)),
    db.delete(usageEvents).where(eq(usageEvents.userId, userId)),
    db.delete(userSettings).where(eq(userSettings.userId, userId)),
    db.delete(users).where(eq(users.id, userId)),
  ] as unknown as [ReturnType<Db['delete']>, ...ReturnType<Db['delete']>[]]);

  return { files: keys.length };
}

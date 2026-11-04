import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { attachments } from '../db/schema';
import { ApiError } from '../lib/http';
import { nowIso } from '../lib/time';
import type { Env } from '../types';
import {
  ALLOWED_EXTENSIONS,
  extensionOf,
  IMAGE_MIMES,
  matchesMagic,
  sanitizeFilename,
} from './files';

export const MAX_FILES_PER_REQUEST = 5;
const MB = 1024 * 1024;

export const limitsFrom = (env: Env) => ({
  maxFileBytes: (Number(env.MAX_UPLOAD_MB) || 10) * MB,
  quotaBytes: (Number(env.USER_STORAGE_QUOTA_MB) || 500) * MB,
});

type Row = typeof attachments.$inferSelect;
export interface AttachmentDto {
  id: string;
  taskId: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  createdAt: string;
  isImage: boolean;
}

export const toDto = (r: Row): AttachmentDto => ({
  id: r.id,
  taskId: r.taskId,
  filename: r.filename,
  mime: r.mime,
  sizeBytes: r.sizeBytes,
  createdAt: r.createdAt,
  isImage: IMAGE_MIMES.has(r.mime),
});

export async function usedBytes(db: Db, userId: string): Promise<number> {
  const r = await db
    .select({ total: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)` })
    .from(attachments)
    .where(eq(attachments.userId, userId))
    .get();
  return Number(r?.total ?? 0);
}

export async function getOwnedAttachment(db: Db, userId: string, id: string): Promise<Row> {
  const row = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
    .get();
  if (!row) throw new ApiError(404, 'not_found', 'ไม่พบไฟล์แนบนี้');
  return row;
}

/** ตรวจไฟล์ทั้งหมดก่อนเขียนอะไรลง R2 — ถ้าไฟล์ใดไม่ผ่าน ไม่มีไฟล์ไหนถูกบันทึก */
export async function saveUploads(
  db: Db,
  bucket: R2Bucket,
  env: Env,
  userId: string,
  taskId: string,
  files: File[],
): Promise<AttachmentDto[]> {
  const { maxFileBytes, quotaBytes } = limitsFrom(env);
  if (files.length === 0) throw new ApiError(400, 'no_files', 'ไม่พบไฟล์ที่อัปโหลด');
  if (files.length > MAX_FILES_PER_REQUEST) {
    throw new ApiError(
      400,
      'too_many_files',
      `อัปโหลดได้ครั้งละไม่เกิน ${MAX_FILES_PER_REQUEST} ไฟล์`,
    );
  }

  const used = await usedBytes(db, userId);
  let incoming = 0;
  const prepared: { file: File; filename: string; mime: string }[] = [];
  for (const file of files) {
    const filename = sanitizeFilename(file.name);
    if (file.size === 0) throw new ApiError(400, 'empty_file', `ไฟล์ว่างเปล่า: ${filename}`);
    if (file.size > maxFileBytes) {
      throw new ApiError(
        413,
        'file_too_large',
        `ไฟล์ใหญ่เกิน ${maxFileBytes / MB} MB: ${filename}`,
      );
    }
    const kind = ALLOWED_EXTENSIONS[extensionOf(filename)];
    if (!kind) throw new ApiError(400, 'unsupported_type', `ไม่รองรับชนิดไฟล์นี้: ${filename}`);
    const head = new Uint8Array(await file.slice(0, 8200).arrayBuffer());
    if (!matchesMagic(kind.sniff, head)) {
      throw new ApiError(400, 'content_mismatch', `เนื้อหาไฟล์ไม่ตรงกับนามสกุล: ${filename}`);
    }
    incoming += file.size;
    prepared.push({ file, filename, mime: kind.mime });
  }
  if (used + incoming > quotaBytes) {
    throw new ApiError(413, 'quota_exceeded', 'พื้นที่จัดเก็บไฟล์เต็ม กรุณาลบไฟล์เก่าก่อน');
  }

  const saved: Row[] = [];
  try {
    for (const p of prepared) {
      const id = crypto.randomUUID();
      const r2Key = `${userId}/${taskId}/${id}`; // ไม่ใช้ชื่อไฟล์ผู้ใช้ใน key
      await bucket.put(r2Key, await p.file.arrayBuffer(), {
        httpMetadata: { contentType: p.mime },
      });
      const row: Row = {
        id,
        taskId,
        userId,
        r2Key,
        filename: p.filename,
        mime: p.mime,
        sizeBytes: p.file.size,
        createdAt: nowIso(),
      };
      await db.insert(attachments).values(row);
      saved.push(row);
    }
  } catch (e) {
    // ย้อนกลับไฟล์ที่เขียนไปแล้วในคำขอนี้ ไม่ให้เหลือไฟล์กำพร้า
    if (saved.length) {
      await bucket.delete(saved.map((s) => s.r2Key)).catch(() => undefined);
      await db.delete(attachments).where(
        inArray(
          attachments.id,
          saved.map((s) => s.id),
        ),
      );
    }
    throw e;
  }
  return saved.map(toDto);
}

export async function listForTask(
  db: Db,
  userId: string,
  taskId: string,
): Promise<AttachmentDto[]> {
  const rows = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.taskId, taskId), eq(attachments.userId, userId)))
    .orderBy(attachments.createdAt);
  return rows.map(toDto);
}

export async function deleteAttachment(db: Db, bucket: R2Bucket, userId: string, id: string) {
  const row = await getOwnedAttachment(db, userId, id);
  await bucket.delete(row.r2Key); // ลบ R2 ก่อน: ถ้าพลาด แถวยังอยู่ ผู้ใช้ลองใหม่ได้
  await db.delete(attachments).where(and(eq(attachments.id, id), eq(attachments.userId, userId)));
}

/** ลบไฟล์ทั้งหมดของงาน (ใช้ตอนลบงาน) */
export async function deleteTaskFiles(db: Db, bucket: R2Bucket, userId: string, taskId: string) {
  const rows = await db
    .select({ id: attachments.id, r2Key: attachments.r2Key })
    .from(attachments)
    .where(and(eq(attachments.taskId, taskId), eq(attachments.userId, userId)));
  for (let i = 0; i < rows.length; i += 1000) {
    await bucket.delete(rows.slice(i, i + 1000).map((r) => r.r2Key));
  }
  await db
    .delete(attachments)
    .where(and(eq(attachments.taskId, taskId), eq(attachments.userId, userId)));
}

export async function countsByTask(db: Db, taskIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < taskIds.length; i += 50) {
    const rows = await db
      .select({ taskId: attachments.taskId, n: sql<number>`count(*)` })
      .from(attachments)
      .where(inArray(attachments.taskId, taskIds.slice(i, i + 50)))
      .groupBy(attachments.taskId);
    for (const r of rows) out.set(r.taskId, Number(r.n));
  }
  return out;
}

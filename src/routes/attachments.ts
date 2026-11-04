import { Hono } from 'hono';
import { getDb } from '../db/client';
import { ApiError } from '../lib/http';
import {
  deleteAttachment,
  getOwnedAttachment,
  limitsFrom,
  listForTask,
  MAX_FILES_PER_REQUEST,
  saveUploads,
  usedBytes,
} from '../services/attachments';
import { contentDisposition, IMAGE_MIMES } from '../services/files';
import { getOwned } from '../services/tasks';
import type { AppEnv } from '../types';

const r = new Hono<AppEnv>();

r.get('/tasks/:id/attachments', async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  await getOwned(db, userId, c.req.param('id'));
  return c.json({ attachments: await listForTask(db, userId, c.req.param('id')) });
});

r.post('/tasks/:id/attachments', async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.get('userId');
  const taskId = c.req.param('id');
  await getOwned(db, userId, taskId); // ตรวจสิทธิ์ก่อนอ่าน body

  const { maxFileBytes } = limitsFrom(c.env);
  const len = Number(c.req.header('Content-Length'));
  if (!Number.isFinite(len) || len <= 0) {
    throw new ApiError(400, 'length_required', 'ต้องระบุ Content-Length');
  }
  // เพดานของทั้งคำขอ = ไฟล์สูงสุดต่อครั้ง + overhead ของ multipart
  if (len > maxFileBytes * MAX_FILES_PER_REQUEST + 1024 * 1024) {
    throw new ApiError(413, 'request_too_large', 'ขนาดคำขอใหญ่เกินกำหนด');
  }
  const ct = c.req.header('Content-Type') ?? '';
  if (!ct.toLowerCase().startsWith('multipart/form-data')) {
    throw new ApiError(400, 'invalid_content_type', 'ต้องส่งเป็น multipart/form-data');
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new ApiError(400, 'invalid_form', 'อ่านข้อมูลฟอร์มไม่ได้');
  }
  const files = [...form.getAll('files'), ...form.getAll('file')].filter(
    (f): f is File => typeof f !== 'string',
  );
  const saved = await saveUploads(db, c.env.FILES, c.env, userId, taskId, files);
  return c.json({ attachments: saved }, 201);
});

r.get('/attachments/:id', async (c) => {
  const row = await getOwnedAttachment(getDb(c.env.DB), c.get('userId'), c.req.param('id'));
  const obj = await c.env.FILES.get(row.r2Key);
  if (!obj) throw new ApiError(404, 'not_found', 'ไม่พบไฟล์ในที่จัดเก็บ');
  // รูปแสดงในหน้าได้ (thumbnail); ไฟล์อื่นบังคับดาวน์โหลด
  const disposition = IMAGE_MIMES.has(row.mime) ? 'inline' : 'attachment';
  return new Response(obj.body, {
    headers: {
      'Content-Type': row.mime,
      'Content-Length': String(row.sizeBytes),
      'Content-Disposition': contentDisposition(disposition, row.filename),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=300',
    },
  });
});

r.delete('/attachments/:id', async (c) => {
  await deleteAttachment(getDb(c.env.DB), c.env.FILES, c.get('userId'), c.req.param('id'));
  return c.json({ ok: true });
});

r.get('/storage', async (c) => {
  const { quotaBytes, maxFileBytes } = limitsFrom(c.env);
  return c.json({
    usedBytes: await usedBytes(getDb(c.env.DB), c.get('userId')),
    quotaBytes,
    maxFileBytes,
    maxFiles: MAX_FILES_PER_REQUEST,
  });
});

export default r;

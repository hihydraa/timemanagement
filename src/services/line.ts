import { ApiError } from '../lib/http';
import type { Env } from '../types';

const apiBase = (env: Env) => (env.LINE_API_BASE || 'https://api.line.me').replace(/\/$/, '');
const dataBase = (env: Env) =>
  (env.LINE_API_DATA_BASE || 'https://api-data.line.me').replace(/\/$/, '');

const enc = new TextEncoder();

function b64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * ตรวจ x-line-signature: HMAC-SHA256(key=channel secret, body=raw bytes) เทียบเป็น base64
 * ใช้ crypto.subtle.verify ซึ่งเทียบแบบ constant-time; ไม่มี secret/signature = ไม่ผ่านเสมอ
 */
export async function verifyLineSignature(
  secret: string,
  rawBody: ArrayBuffer,
  signature: string | null | undefined,
): Promise<boolean> {
  if (!secret || !signature) return false;
  const sig = b64ToBytes(signature);
  if (!sig || sig.length !== 32) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, sig, rawBody);
}

export type LineMessage = Record<string, unknown>;

export async function replyMessages(
  env: Env,
  replyToken: string,
  messages: LineMessage[],
): Promise<void> {
  const res = await fetch(`${apiBase(env)}/v2/bot/message/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, 5) }),
  });
  if (!res.ok) {
    // ไม่ log เนื้อหาข้อความของผู้ใช้
    console.error('line reply failed', res.status);
  }
}

/** ดึงไฟล์ที่ผู้ใช้ส่งมา (รูป/ไฟล์) จาก LINE Content API */
export async function getMessageContent(
  env: Env,
  messageId: string,
  maxBytes: number,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const res = await fetch(
    `${dataBase(env)}/v2/bot/message/${encodeURIComponent(messageId)}/content`,
    {
      headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    },
  );
  if (!res.ok)
    throw new ApiError(
      404,
      'content_unavailable',
      'ดึงไฟล์จาก LINE ไม่ได้ (อาจหมดอายุ) กรุณาส่งใหม่อีกครั้ง',
    );
  const declared = Number(res.headers.get('Content-Length'));
  if (declared > maxBytes) throw new ApiError(413, 'file_too_large', 'ไฟล์ใหญ่เกินกำหนด');
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new ApiError(413, 'file_too_large', 'ไฟล์ใหญ่เกินกำหนด');
  return { bytes, contentType: res.headers.get('Content-Type') ?? '' };
}

export interface PushResult {
  ok: boolean;
  /** 0 = ติดต่อ LINE ไม่ได้ (เครือข่าย) */
  status: number;
}

/**
 * ส่ง push ถึงผู้ใช้ 1 ข้อความ (1 message object = นับโควตา 1)
 * `retryKey` ทำให้ retry ปลอดภัย: ถ้าครั้งแรกสำเร็จแต่ตอบไม่ถึง LINE จะไม่ส่งซ้ำ (409 = รับไปแล้ว)
 */
export async function pushMessage(
  env: Env,
  to: string,
  message: LineMessage,
  retryKey: string,
): Promise<PushResult> {
  try {
    const res = await fetch(`${apiBase(env)}/v2/bot/message/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
        'X-Line-Retry-Key': retryKey,
      },
      body: JSON.stringify({ to, messages: [message] }),
    });
    return { ok: res.ok || res.status === 409, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * ภาพตัวละครแบบ PNG สำหรับข้อความ LINE (LINE ดึงภาพจาก https สาธารณะ ไม่ใช้ cookie ได้)
 * เว็บเรนเดอร์ PNG จากชั้นภาพแล้วอัปโหลดเก็บใน R2; ลิงก์สาธารณะแนบลายเซ็น HMAC ต่อผู้ใช้ จึงเดาลิงก์ของคนอื่นไม่ได้
 */
export const MAX_AVATAR_PNG_BYTES = 200 * 1024;
export const avatarKey = (userId: string) => `avatars/${userId}.png`;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const isPng = (b: Uint8Array): boolean => PNG_MAGIC.every((v, i) => b[i] === v);

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** ลายเซ็นของลิงก์ภาพ (HMAC-SHA256 ของ userId ด้วย SESSION_SECRET ตัดเหลือ 32 ตัวอักษร) */
export async function avatarSig(secret: string, userId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`avatar:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId))).slice(0, 32);
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function avatarUrl(base: string, secret: string, userId: string): Promise<string> {
  return `${base.replace(/\/$/, '')}/public/avatar/${userId}/${await avatarSig(secret, userId)}.png`;
}

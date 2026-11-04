/**
 * เข้ารหัส/ถอดรหัสข้อมูลลับ (เช่น Google token) ด้วย AES-256-GCM ผ่าน Web Crypto
 * รูปแบบเก็บ: "v1.<iv base64url>.<ciphertext+tag base64url>"
 * `aad` (additional authenticated data) ผูก ciphertext กับเจ้าของ (userId) กันการสลับแถวข้ามผู้ใช้
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromB64 = (s: string): Uint8Array => {
  const std = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export class CryptoConfigError extends Error {}

async function importKey(keyB64: string | undefined): Promise<CryptoKey> {
  if (!keyB64) throw new CryptoConfigError('TOKEN_ENC_KEY is not set');
  let raw: Uint8Array;
  try {
    raw = fromB64(keyB64.trim());
  } catch {
    throw new CryptoConfigError('TOKEN_ENC_KEY is not valid base64');
  }
  if (raw.length !== 32) throw new CryptoConfigError('TOKEN_ENC_KEY must decode to 32 bytes');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(
  plain: string,
  keyB64: string | undefined,
  aad = '',
): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // IV ใหม่ทุกครั้ง
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
      key,
      enc.encode(plain),
    ),
  );
  return `v1.${toB64(iv)}.${toB64(ct)}`;
}

export async function decryptSecret(
  token: string,
  keyB64: string | undefined,
  aad = '',
): Promise<string> {
  const key = await importKey(keyB64);
  const [v, iv, ct] = token.split('.');
  if (v !== 'v1' || !iv || !ct) throw new Error('invalid ciphertext format');
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(iv), additionalData: enc.encode(aad) },
    key,
    fromB64(ct),
  );
  return dec.decode(pt);
}

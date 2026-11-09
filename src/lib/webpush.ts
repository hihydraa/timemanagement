/**
 * Web Push (RFC 8030) + VAPID (RFC 8292) + เข้ารหัสข้อความแบบ aes128gcm (RFC 8291) ด้วย Web Crypto ล้วน ๆ
 * (ไม่ใช้ไลบรารี: รันบน Cloudflare Workers ได้โดยไม่เพิ่ม dependency)
 */

const enc = new TextEncoder();

export const b64uEncode = (b: ArrayBuffer | Uint8Array): string => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const b64uDecode = (s: string): Uint8Array => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

export interface VapidKeys {
  /** 65 ไบต์ (uncompressed P-256) เป็น base64url */
  publicKey: string;
  /** 32 ไบต์ (d) เป็น base64url */
  privateKey: string;
}

/** สร้างคู่กุญแจ VAPID (ใช้ครั้งเดียวตอนตั้งค่า: scripts/gen-vapid.mjs) */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', kp.privateKey)) as JsonWebKey;
  const pub = concat(new Uint8Array([4]), b64uDecode(jwk.x!), b64uDecode(jwk.y!));
  return { publicKey: b64uEncode(pub), privateKey: jwk.d! };
}

async function importVapidSigningKey(k: VapidKeys): Promise<CryptoKey> {
  const pub = b64uDecode(k.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY ไม่ถูกต้อง');
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: b64uEncode(pub.subarray(1, 33)),
      y: b64uEncode(pub.subarray(33, 65)),
      d: k.privateKey,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/** JWT (ES256) สำหรับหัว Authorization แบบ vapid; aud = origin ของ push service */
export async function vapidAuthHeader(
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  nowSec: number,
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const h = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const c = b64uEncode(enc.encode(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await importVapidSigningKey(keys),
    enc.encode(`${h}.${c}`),
  );
  return `vapid t=${h}.${c}.${b64uEncode(sig)}, k=${keys.publicKey}`;
}

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8),
  );
}

/** เข้ารหัสข้อความให้ผู้รับ (p256dh 65 ไบต์ + auth 16 ไบต์ จาก PushSubscription) → เนื้อหา aes128gcm พร้อมส่ง */
export async function encryptPayload(
  plaintext: Uint8Array,
  p256dh: string,
  auth: string,
): Promise<Uint8Array> {
  const uaPub = b64uDecode(p256dh);
  const authSecret = b64uDecode(auth);
  if (uaPub.length !== 65 || uaPub[0] !== 4) throw new Error('p256dh ไม่ถูกต้อง');
  const eph = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const asPub = new Uint8Array(
    (await crypto.subtle.exportKey('raw', eph.publicKey)) as ArrayBuffer,
  );
  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPub,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      eph.privateKey,
      256,
    ),
  );
  const ikm = await hkdf(
    shared,
    authSecret,
    concat(enc.encode('WebPush: info\0'), uaPub, asPub),
    32,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // ระเบียนเดียว: ข้อความ + ตัวคั่น 0x02 (ระเบียนสุดท้าย)
  const record = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aes,
      concat(plaintext, new Uint8Array([2])),
    ),
  );
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([65]), asPub, record);
}

export interface PushResult {
  ok: boolean;
  status: number;
  /** push service บอกว่า subscription ใช้ไม่ได้อีกแล้ว (404/410) → ลบทิ้ง */
  gone: boolean;
}

/** push service ที่อนุญาต (กัน SSRF: endpoint มาจากผู้ใช้) */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /\.push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/,
  /^web\.push\.apple\.com$/,
  /\.push\.apple\.com$/,
];
export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}

export interface SubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendWebPush(
  sub: SubscriptionKeys,
  payload: unknown,
  vapid: VapidKeys,
  subject: string,
  opts: { ttl?: number; urgency?: 'normal' | 'high'; nowSec?: number; fetchFn?: typeof fetch } = {},
): Promise<PushResult> {
  if (!isAllowedPushEndpoint(sub.endpoint)) return { ok: false, status: 400, gone: true };
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), sub.p256dh, sub.auth);
  const f = opts.fetchFn ?? fetch;
  try {
    const res = await f(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthHeader(
          sub.endpoint,
          vapid,
          subject,
          opts.nowSec ?? Math.floor(Date.now() / 1000),
        ),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(opts.ttl ?? 3600),
        Urgency: opts.urgency ?? 'normal',
      },
      body,
    });
    return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
  } catch {
    return { ok: false, status: 0, gone: false };
  }
}

import { describe, expect, it } from 'vitest';
import {
  b64uDecode,
  b64uEncode,
  encryptPayload,
  generateVapidKeys,
  isAllowedPushEndpoint,
  sendWebPush,
  vapidAuthHeader,
} from '../src/lib/webpush';

const dec = new TextDecoder();

/** ฝั่งผู้รับ (เบราว์เซอร์) จำลอง: ถอด aes128gcm ตาม RFC 8291 เพื่อพิสูจน์ว่าเราเข้ารหัสถูกต้อง */
async function decrypt(body: Uint8Array, uaPriv: CryptoKey, uaPub: Uint8Array, auth: Uint8Array) {
  const salt = body.subarray(0, 16);
  const idlen = body[20]!;
  const asPub = body.subarray(21, 21 + idlen);
  const cipher = body.subarray(21 + idlen);
  const asKey = await crypto.subtle.importKey(
    'raw',
    asPub,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: asKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      uaPriv,
      256,
    ),
  );
  const hk = async (ikm: Uint8Array, s: Uint8Array, info: Uint8Array, n: number) =>
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: s, info },
        await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']),
        n * 8,
      ),
    );
  const te = new TextEncoder();
  const keyInfo = new Uint8Array([...te.encode('WebPush: info\0'), ...uaPub, ...asPub]);
  const ikm = await hk(shared, auth, keyInfo, 32);
  const cek = await hk(ikm, salt, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hk(ikm, salt, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
}

async function receiver() {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { priv: kp.privateKey, pub, auth, p256dh: b64uEncode(pub), authB64: b64uEncode(auth) };
}

describe('Web Push crypto', () => {
  it('b64url roundtrip', () => {
    const x = crypto.getRandomValues(new Uint8Array(33));
    expect([...b64uDecode(b64uEncode(x))]).toEqual([...x]);
  });
  it('เข้ารหัสแล้วฝั่งผู้รับถอดได้ข้อความเดิม (ภาษาไทยด้วย) และแต่ละครั้งไม่ซ้ำกัน', async () => {
    const r = await receiver();
    const msg = new TextEncoder().encode(
      JSON.stringify({ title: 'สรุปเช้า', body: 'วันนี้ 3 งาน' }),
    );
    const a = await encryptPayload(msg, r.p256dh, r.authB64);
    const b = await encryptPayload(msg, r.p256dh, r.authB64);
    expect(b64uEncode(a)).not.toBe(b64uEncode(b));
    const plain = await decrypt(a, r.priv, r.pub, r.auth);
    expect(plain[plain.length - 1]).toBe(2); // ตัวคั่นระเบียนสุดท้าย
    expect(dec.decode(plain.subarray(0, -1))).toBe(dec.decode(msg));
    expect(a.length).toBeLessThanOrEqual(4096);
  });
  it('VAPID: JWT ลงลายเซ็น ES256 ตรวจด้วยกุญแจสาธารณะผ่าน และ aud เป็น origin ของ push service', async () => {
    const k = await generateVapidKeys();
    expect(b64uDecode(k.publicKey)).toHaveLength(65);
    const h = await vapidAuthHeader(
      'https://fcm.googleapis.com/fcm/send/abc',
      k,
      'mailto:a@b.c',
      1_700_000_000,
    );
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(h)!;
    expect(m[2]).toBe(k.publicKey);
    const [hd, cl, sig] = m[1]!.split('.') as [string, string, string];
    expect(JSON.parse(dec.decode(b64uDecode(cl)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: 1_700_000_000 + 12 * 3600,
      sub: 'mailto:a@b.c',
    });
    const pub = b64uDecode(k.publicKey);
    const key = await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC',
        crv: 'P-256',
        x: b64uEncode(pub.subarray(1, 33)),
        y: b64uEncode(pub.subarray(33)),
      },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    expect(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        b64uDecode(sig),
        new TextEncoder().encode(`${hd}.${cl}`),
      ),
    ).toBe(true);
  });
  it('ส่งจริง: หัว/เนื้อหาถูกต้อง, 410 = gone, endpoint นอกรายการไม่ถูกเรียก (กัน SSRF)', async () => {
    const r = await receiver();
    const k = await generateVapidKeys();
    const calls: { url: string; init: RequestInit }[] = [];
    const mk = (status: number) =>
      (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(null, { status });
      }) as unknown as typeof fetch;
    const sub = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/x',
      p256dh: r.p256dh,
      auth: r.authB64,
    };
    const ok = await sendWebPush(sub, { title: 't' }, k, 'mailto:a@b.c', { fetchFn: mk(201) });
    expect(ok).toEqual({ ok: true, status: 201, gone: false });
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h['Content-Encoding']).toBe('aes128gcm');
    expect(h.Authorization).toMatch(/^vapid t=/);
    const plain = await decrypt(calls[0]!.init.body as Uint8Array, r.priv, r.pub, r.auth);
    expect(JSON.parse(dec.decode(plain.subarray(0, -1)))).toEqual({ title: 't' });
    expect((await sendWebPush(sub, {}, k, 's', { fetchFn: mk(410) })).gone).toBe(true);
    expect((await sendWebPush(sub, {}, k, 's', { fetchFn: mk(500) })).gone).toBe(false);
    const n = calls.length;
    const bad = await sendWebPush({ ...sub, endpoint: 'https://evil.example.com/x' }, {}, k, 's', {
      fetchFn: mk(201),
    });
    expect(bad.ok).toBe(false);
    expect(calls.length).toBe(n);
  });
  it.each([
    ['https://fcm.googleapis.com/fcm/send/a', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/a', true],
    ['https://wns2-par02p.notify.windows.com/w/?token=1', true],
    ['https://web.push.apple.com/Q', true],
    ['http://fcm.googleapis.com/x', false],
    ['https://fcm.googleapis.com.evil.com/x', false],
    ['https://fcm.googleapis.com:8443/x', false],
    ['https://169.254.169.254/x', false],
    ['not a url', false],
  ])('endpoint %s allowed=%s', (u, ok) => expect(isAllowedPushEndpoint(u)).toBe(ok));
});

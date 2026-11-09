/* global Buffer, console */
// สร้างคู่กุญแจ VAPID สำหรับแจ้งเตือนในเว็บ (รันครั้งเดียว): node scripts/gen-vapid.mjs
// แล้วตั้งเป็น secret ด้วย wrangler (อย่า commit/แชร์ค่าเหล่านี้)
import { webcrypto as c } from 'node:crypto';

const b64u = (b) => Buffer.from(b).toString('base64url');
const kp = await c.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const jwk = await c.subtle.exportKey('jwk', kp.privateKey);
const pub = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(jwk.x, 'base64url'),
  Buffer.from(jwk.y, 'base64url'),
]);
console.log(`VAPID_PUBLIC_KEY=${b64u(pub)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log(
  '\nตั้งค่า:\n  npx wrangler secret put VAPID_PUBLIC_KEY\n  npx wrangler secret put VAPID_PRIVATE_KEY\n(local: ใส่ทั้งสองบรรทัดใน .dev.vars)',
);

/* global console, process, URL */
// ตรวจค่าก่อน deploy จริง: ล้มเหลว (exit 1) ถ้ายังเป็นค่า placeholder / ไม่ปลอดภัย
import { readFileSync } from 'node:fs';

const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const errors = [];
if (toml.includes('REPLACE_WITH_YOUR_D1_ID'))
  errors.push(
    'wrangler.toml: database_id ยังเป็น REPLACE_WITH_YOUR_D1_ID (รัน wrangler d1 create)',
  );
const base = /^APP_BASE_URL\s*=\s*"([^"]*)"/m.exec(toml)?.[1] ?? '';
if (!base.startsWith('https://'))
  errors.push(`wrangler.toml: APP_BASE_URL ต้องเป็น https:// (ตอนนี้ "${base}")`);
if (!/^PUSH_MONTHLY_LIMIT\s*=\s*"\d+"/m.test(toml))
  errors.push('wrangler.toml: ต้องตั้ง PUSH_MONTHLY_LIMIT ตามโควตา LINE OA ของคุณ');

// คำเตือน (ไม่ล้ม deploy): ถ้าจะเปิดสาธารณะ ควรมีอีเมลติดต่อในหน้านโยบายความเป็นส่วนตัว
const contact = /^CONTACT_EMAIL\s*=\s*"([^"]*)"/m.exec(toml)?.[1] ?? '';
if (!contact.trim())
  console.warn(
    '! CONTACT_EMAIL ว่าง: หน้า /privacy จะบอกให้ติดต่อผ่าน LINE OA (ถ้าเปิดสาธารณะ ควรตั้งอีเมลติดต่อ)',
  );

if (errors.length) {
  console.error('\n✖ ยังไม่พร้อม deploy:\n' + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('✔ wrangler.toml พร้อม deploy');
console.log(
  'อย่าลืมตั้ง secrets (wrangler secret put): SESSION_SECRET, TOKEN_ENC_KEY, ALLOWED_EMAILS, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN',
);

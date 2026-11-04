/**
 * ตั้งค่า Rich Menu ของ LINE OA (4 ปุ่ม: งานวันนี้ / เพิ่มงาน / สัปดาห์นี้ / เปิดเว็บ)
 *
 * ใช้:
 *   LINE_CHANNEL_ACCESS_TOKEN=xxx APP_BASE_URL=https://dobby.<you>.workers.dev npm run richmenu
 *   npm run richmenu -- --dry-run     # แสดง payload และตรวจรูปโดยไม่เรียก LINE
 *
 * เปลี่ยนรูปเมนูได้ที่ scripts/richmenu.png (PNG 2500x843 ขนาด ≤ 1 MB)
 */
import { readFileSync } from 'node:fs';
import { buildRichMenu } from '../src/services/richMenu.ts';

const API = 'https://api.line.me';
const API_DATA = 'https://api-data.line.me';
const MENU_NAME = 'Dobby main menu';

const dryRun = process.argv.includes('--dry-run');
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
const baseUrl = process.env.APP_BASE_URL ?? '';

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!baseUrl) fail('ต้องตั้ง APP_BASE_URL (เช่น https://dobby.<you>.workers.dev)');
if (!baseUrl.startsWith('https://')) {
  console.warn('! APP_BASE_URL ไม่ใช่ https — LINE อาจปฏิเสธปุ่ม "เปิดเว็บ"');
}

const image = readFileSync(new URL('./richmenu.png', import.meta.url));
const isPng = image
  .subarray(0, 8)
  .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const width = image.readUInt32BE(16);
const height = image.readUInt32BE(20);
if (!isPng || width !== 2500 || height !== 843)
  fail(`richmenu.png ต้องเป็น PNG 2500x843 (พบ ${width}x${height})`);
if (image.length > 1024 * 1024) fail('richmenu.png ต้องมีขนาดไม่เกิน 1 MB');

const menu = buildRichMenu(baseUrl);

if (dryRun) {
  console.log(JSON.stringify(menu, null, 2));
  console.log(
    `✓ dry-run: รูป ${width}x${height}, ${(image.length / 1024).toFixed(0)} KB (ยังไม่ได้เรียก LINE)`,
  );
  process.exit(0);
}
if (!token) fail('ต้องตั้ง LINE_CHANNEL_ACCESS_TOKEN');

async function line(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!res.ok)
    fail(`${init.method ?? 'GET'} ${new URL(url).pathname} → ${res.status} ${await res.text()}`);
  return res;
}

// 1) ลบเมนูเดิมชื่อเดียวกัน (กันซ้ำเมื่อรันหลายครั้ง)
const list = (await (await line(`${API}/v2/bot/richmenu/list`)).json()) as {
  richmenus: { richMenuId: string; name: string }[];
};
for (const m of list.richmenus.filter((x) => x.name === MENU_NAME)) {
  await line(`${API}/v2/bot/richmenu/${m.richMenuId}`, { method: 'DELETE' });
  console.log(`- ลบเมนูเดิม ${m.richMenuId}`);
}

// 2) สร้างเมนู 3) อัปโหลดรูป 4) ตั้งเป็นค่าเริ่มต้นของทุกคน
const created = (await (
  await line(`${API}/v2/bot/richmenu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(menu),
  })
).json()) as { richMenuId: string };
const id = created.richMenuId;
await line(`${API_DATA}/v2/bot/richmenu/${id}/content`, {
  method: 'POST',
  headers: { 'Content-Type': 'image/png' },
  body: image,
});
await line(`${API}/v2/bot/user/all/richmenu/${id}`, { method: 'POST' });
console.log(`✓ ตั้งค่า Rich Menu สำเร็จ (${id})`);

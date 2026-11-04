import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { makeEnv } from './helpers/app';

const get = (path: string, over = {}) => app.request(`http://localhost${path}`, {}, makeEnv(over));

describe('หน้านโยบายความเป็นส่วนตัวและข้อกำหนด', () => {
  it('เปิดได้โดยไม่ต้องล็อกอิน เป็น HTML ภาษาไทย พร้อม security headers', async () => {
    for (const p of ['/privacy', '/terms']) {
      const r = await get(p);
      expect(r.status, p).toBe(200);
      expect(r.headers.get('content-type')).toContain('text/html');
      expect(r.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      const html = await r.text();
      expect(html).toContain('lang="th"');
      expect(html).not.toMatch(/<script/i); // หน้ากฎหมายไม่มีสคริปต์
    }
  });

  it('เนื้อหาตรงกับสิ่งที่ระบบทำจริง: ข้อมูลที่เก็บ ผู้ให้บริการ และวิธีลบบัญชี', async () => {
    const html = await (await get('/privacy')).text();
    for (const k of [
      'Cloudflare',
      'Google',
      'LINE',
      'AES-256-GCM',
      'ลบบัญชีและข้อมูลทั้งหมด',
      'calendar.events',
    ])
      expect(html, k).toContain(k);
  });

  it('แสดงอีเมลติดต่อที่ตั้งไว้ และ escape ตัวอักษรอันตราย', async () => {
    const ok = await (await get('/privacy', { CONTACT_EMAIL: 'owner@example.com' })).text();
    expect(ok).toContain('mailto:owner@example.com');
    const evil = await (
      await get('/terms', { CONTACT_EMAIL: '"><script>alert(1)</script>' })
    ).text();
    expect(evil).not.toContain('<script>alert(1)');
    expect(evil).toContain('&lt;script&gt;');
  });

  it('ไม่ตั้งอีเมลติดต่อ = บอกให้ติดต่อผ่าน LINE OA (ไม่ขึ้นลิงก์ว่าง)', async () => {
    const html = await (await get('/privacy')).text();
    expect(html).not.toContain('mailto:');
    expect(html).toContain('LINE Official Account');
  });
});

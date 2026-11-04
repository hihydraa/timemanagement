import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { makeEnv } from './helpers/app';

/** security headers ต้องเหมือนกันทั้งหน้า static (public/_headers) และที่ Worker ตอบ */
const staticHeaders = (() => {
  const txt = readFileSync(join(process.cwd(), 'apps/web/public/_headers'), 'utf8');
  // ตัดบรรทัดคอมเมนต์ (#) ก่อนแยกเป็นบล็อก
  const clean = txt
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n');
  const block = clean
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .find((b) => b.startsWith('/*\n'))!;
  const out: Record<string, string> = {};
  for (const line of block.split('\n').slice(1)) {
    const m = /^\s+([\w-]+):\s*(.+)$/.exec(line);
    if (m) out[m[1]!.toLowerCase()] = m[2]!.trim();
  }
  return out;
})();

describe('security headers', () => {
  it('Worker ตอบ CSP/headers ครบ และตรงกับ _headers', async () => {
    const res = await app.request('http://localhost/api/health', {}, makeEnv());
    const csp = res.headers.get('content-security-policy')!;
    const norm = (s: string) =>
      s
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .sort();
    expect(norm(csp)).toEqual(norm(staticHeaders['content-security-policy']!));
    for (const d of [
      "default-src 'self'",
      "script-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "worker-src 'self'",
      "manifest-src 'self'",
    ]) {
      expect(csp).toContain(d);
    }
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('permissions-policy')).toMatch(/camera=\(\)/);
    expect(res.headers.get('strict-transport-security')).toBeTruthy();
  });
  it('_headers ของ static มีครบ และ hashed assets แคชได้ยาว แต่ sw.js ไม่แคช', () => {
    expect(staticHeaders['x-content-type-options']).toBe('nosniff');
    expect(staticHeaders['x-frame-options']).toBe('DENY');
    expect(staticHeaders['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(staticHeaders['strict-transport-security']).toMatch(/max-age=\d+/);
    const txt = readFileSync(join(process.cwd(), 'apps/web/public/_headers'), 'utf8');
    expect(txt).toMatch(/\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
    expect(txt).toMatch(/\/sw\.js\n\s+Cache-Control: no-cache/);
  });
  it('ไฟล์ดาวน์โหลดของผู้ใช้ยังได้ CSP แบบ sandbox ของตัวเอง', async () => {
    // route ดาวน์โหลดตั้ง CSP เอง (ดู tests/attachments.test.ts); ที่นี่ตรวจแค่ว่า global CSP ไม่ถูกเปลี่ยนจนขัดกัน
    const res = await app.request('http://localhost/api/health', {}, makeEnv());
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  });
});

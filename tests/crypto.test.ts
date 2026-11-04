import { describe, expect, it } from 'vitest';
import { CryptoConfigError, decryptSecret, encryptSecret } from '../src/lib/crypto';

const KEY = Buffer.alloc(32, 9).toString('base64');
const OTHER = Buffer.alloc(32, 1).toString('base64');

describe('AES-GCM', () => {
  it('เข้ารหัสแล้วถอดกลับได้ (รวมภาษาไทย/ข้อความยาว)', async () => {
    for (const plain of ['1//0g-refresh-token', 'โทเคนลับ ภาษาไทย', 'x'.repeat(5000)]) {
      expect(await decryptSecret(await encryptSecret(plain, KEY, 'u1'), KEY, 'u1')).toBe(plain);
    }
  });
  it('ciphertext ไม่มี plaintext และใช้ IV ใหม่ทุกครั้ง', async () => {
    const a = await encryptSecret('refresh-token-abc', KEY, 'u1');
    const b = await encryptSecret('refresh-token-abc', KEY, 'u1');
    expect(a).not.toContain('refresh-token-abc');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1.')).toBe(true);
  });
  it('ถูกแก้ไข (tamper) / key ผิด / aad ผิด → ถอดไม่ได้', async () => {
    const c = await encryptSecret('secret', KEY, 'u1');
    const [v, iv, ct] = c.split('.');
    const flipped = `${v}.${iv}.${ct!.slice(0, -2)}${ct!.endsWith('AA') ? 'BB' : 'AA'}`;
    await expect(decryptSecret(flipped, KEY, 'u1')).rejects.toThrow();
    await expect(decryptSecret(c, OTHER, 'u1')).rejects.toThrow();
    await expect(decryptSecret(c, KEY, 'u2')).rejects.toThrow(); // ผูกกับเจ้าของ
    await expect(decryptSecret('garbage', KEY, 'u1')).rejects.toThrow();
  });
  it('ไม่ตั้ง key / key ความยาวผิด → error ที่ชัดเจน (ไม่เก็บ plaintext แทน)', async () => {
    await expect(encryptSecret('x', undefined)).rejects.toBeInstanceOf(CryptoConfigError);
    await expect(encryptSecret('x', '')).rejects.toBeInstanceOf(CryptoConfigError);
    await expect(encryptSecret('x', btoa('short'))).rejects.toBeInstanceOf(CryptoConfigError);
    await expect(encryptSecret('x', '***not base64***')).rejects.toBeInstanceOf(CryptoConfigError);
  });
});

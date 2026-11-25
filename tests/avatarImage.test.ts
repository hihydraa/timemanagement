import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { avatarSig, avatarUrl, isPng, safeEqual } from '../src/lib/avatarImage';
import { listCard } from '../src/services/flex';
import { Client, makeEnv } from './helpers/app';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
let env: ReturnType<typeof makeEnv>;
let a: Client;
let b: Client;
beforeEach(async () => {
  env = makeEnv();
  a = new Client(env);
  b = new Client(env);
  await a.login('a@x.com');
  await b.login('b@x.com');
});

const put = (c: Client, body: Uint8Array | string) =>
  app.request(
    'http://localhost:8787/api/avatar2d/image',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png', Cookie: c.cookie },
      body,
    },
    env,
  );
const userIdOf = async (c: Client) => {
  const r = await c.call('GET', '/api/me');
  return (r.json as { user: { id: string } }).user.id;
};

describe('ภาพตัวละครสำหรับ LINE', () => {
  it('ตรวจ PNG, ลายเซ็นไม่ซ้ำต่อผู้ใช้, เทียบแบบคงที่', async () => {
    expect(isPng(PNG)).toBe(true);
    expect(isPng(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(await avatarSig('s', 'u1')).not.toBe(await avatarSig('s', 'u2'));
    expect(await avatarSig('s', 'u1')).toHaveLength(32);
    expect(safeEqual('ab', 'ab')).toBe(true);
    expect(safeEqual('ab', 'ac')).toBe(false);
    expect(safeEqual('ab', 'abc')).toBe(false);
  });

  it('อัปโหลดแล้วดึงผ่านลิงก์สาธารณะได้ ลายเซ็นผิดหรือของคนอื่นได้ 404', async () => {
    expect((await put(a, PNG)).status).toBe(200);
    const idA = await userIdOf(a);
    const sig = await avatarSig(env.SESSION_SECRET, idA);
    const ok = await app.request(`http://x/public/avatar/${idA}/${sig}.png`, {}, env);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(PNG);
    // ลายเซ็นผิด
    expect(
      (await app.request(`http://x/public/avatar/${idA}/${'0'.repeat(32)}.png`, {}, env)).status,
    ).toBe(404);
    // ผู้ใช้ B ใช้ลายเซ็นของตัวเองกับ id ของ A ไม่ได้
    const idB = await userIdOf(b);
    const sigB = await avatarSig(env.SESSION_SECRET, idB);
    expect((await app.request(`http://x/public/avatar/${idA}/${sigB}.png`, {}, env)).status).toBe(
      404,
    );
    // B ยังไม่เคยอัปโหลด → 404 แม้ลายเซ็นถูก
    expect((await app.request(`http://x/public/avatar/${idB}/${sigB}.png`, {}, env)).status).toBe(
      404,
    );
  });

  it('ปฏิเสธไฟล์ที่ไม่ใช่ PNG / ใหญ่เกิน / ไม่ล็อกอิน', async () => {
    expect((await put(a, 'not a png')).status).toBe(400);
    const big = new Uint8Array(210 * 1024);
    big.set(PNG);
    expect((await put(a, big)).status).toBe(413);
    const anon = await app.request(
      'http://localhost:8787/api/avatar2d/image',
      { method: 'PUT', body: PNG },
      env,
    );
    expect(anon.status).toBe(401);
    expect(env.FILES.keys()).toEqual([]);
  });

  it('การ์ด LINE ใช้ภาพตัวละครเป็นหัวการ์ดเมื่อมี https และไม่ใช้เมื่อไม่ใช่ https', async () => {
    const url = await avatarUrl('https://d.example.com/', 'secret', 'u1');
    expect(url).toMatch(/^https:\/\/d\.example\.com\/public\/avatar\/u1\/[0-9a-f]{32}\.png$/);
    const hero = (m: unknown) => (m as { contents: { hero?: { url: string } } }).contents.hero;
    const sec = [{ title: 'x', tasks: [] }];
    expect(
      hero(listCard('x', sec, 'https://d.example.com', 'morning', undefined, url).message)?.url,
    ).toBe(url);
    expect(
      hero(
        listCard('x', sec, 'https://d.example.com', 'morning', undefined, 'http://x/a.png').message,
      )?.url,
    ).toMatch(/mascot\/morning\.png$/);
  });
});

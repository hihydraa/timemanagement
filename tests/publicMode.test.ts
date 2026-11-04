import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../src/db/client';
import { freezeNow } from '../src/lib/time';
import { perUserCap } from '../src/services/notifications';
import { canSignUp, isEmailAllowed, isOpenSignup, maxUsers } from '../src/services/users';
import { Client, makeEnv } from './helpers/app';

beforeEach(() => freezeNow(new Date('2026-11-04T03:00:00Z')));
afterEach(() => {
  freezeNow(null);
  vi.unstubAllGlobals();
});

describe('เปิดสาธารณะ: ALLOWED_EMAILS=*', () => {
  it('* อนุญาตทุกอีเมลที่มี @ ส่วนรายชื่อปกติยังเข้มงวดเหมือนเดิม', () => {
    expect(isOpenSignup('*')).toBe(true);
    expect(isOpenSignup('a@x.com')).toBe(false);
    expect(isOpenSignup(undefined)).toBe(false);
    expect(isEmailAllowed('*', 'anyone@gmail.com')).toBe(true);
    expect(isEmailAllowed('*', 'not-an-email')).toBe(false);
    expect(isEmailAllowed('a@x.com', 'b@x.com')).toBe(false);
    expect(isEmailAllowed('', 'a@x.com')).toBe(false); // ไม่ตั้งค่า = ปิด (fail closed)
  });

  it('เพดานผู้ใช้: ตั้งเองได้, โหมดเปิดไม่ตั้ง = 50, โหมดรายชื่อไม่จำกัด', () => {
    expect(maxUsers({ ALLOWED_EMAILS: '*' })).toBe(50);
    expect(maxUsers({ ALLOWED_EMAILS: '*', MAX_USERS: '5' })).toBe(5);
    expect(maxUsers({ ALLOWED_EMAILS: 'a@x.com' })).toBeNull();
    expect(maxUsers({ ALLOWED_EMAILS: '*', MAX_USERS: 'abc' })).toBe(50);
  });

  it('ผู้สมัครใหม่ถูกปฏิเสธเมื่อเต็ม แต่ผู้ใช้เดิมเข้าได้เสมอ', async () => {
    const env = makeEnv({ ALLOWED_EMAILS: '*', MAX_USERS: '2' });
    const db = getDb(env.DB);
    const mk = (e: string) => new Client(env).login(e);
    expect((await mk('u1@x.com')).status).toBe(302);
    expect((await mk('u2@x.com')).status).toBe(302);
    expect(await canSignUp(db, env, 'u3@x.com')).toBe(false);
    expect(await canSignUp(db, env, 'U1@X.com')).toBe(true); // ผู้ใช้เดิม (ไม่สนตัวพิมพ์)
    const full = await mk('u3@x.com');
    expect(full.status).toBe(403);
    expect((await mk('u1@x.com')).status).toBe(302);
  });
});

describe('เพดานจำนวนงานต่อผู้ใช้', () => {
  it('เกินเพดาน = 409 task_limit และไม่กระทบผู้ใช้อื่น', async () => {
    const env = makeEnv({ MAX_TASKS_PER_USER: '2' });
    const a = new Client(env);
    const b = new Client(env);
    await a.login('a@x.com');
    await b.login('b@x.com');
    expect((await a.call('POST', '/api/tasks', { title: '1' })).status).toBe(201);
    expect((await a.call('POST', '/api/tasks', { title: '2' })).status).toBe(201);
    const over = await a.call('POST', '/api/tasks', { title: '3' });
    expect(over.status).toBe(409);
    expect(over.json.error.code).toBe('task_limit');
    expect((await b.call('POST', '/api/tasks', { title: 'b1' })).status).toBe(201);
    // ลบแล้วสร้างได้อีก
    const list = (await a.call('GET', '/api/tasks')).json.tasks as { id: string }[];
    await a.call('DELETE', `/api/tasks/${list[0]!.id}`);
    expect((await a.call('POST', '/api/tasks', { title: '4' })).status).toBe(201);
  });
});

describe('ส่วนแบ่ง push ต่อผู้ใช้', () => {
  it('แบ่งเท่ากันจากโควตา OA ÷ ผู้ใช้ที่ผูก LINE (อย่างน้อย 1)', () => {
    expect(perUserCap({}, 200, 1)).toBe(200);
    expect(perUserCap({}, 200, 10)).toBe(20);
    expect(perUserCap({}, 200, 0)).toBe(200);
    expect(perUserCap({}, 5, 50)).toBe(1);
  });
  it('ตั้งค่าเองได้ (PUSH_PER_USER_MONTHLY)', () => {
    expect(perUserCap({ PUSH_PER_USER_MONTHLY: '8' }, 200, 10)).toBe(8);
    expect(perUserCap({ PUSH_PER_USER_MONTHLY: 'x' }, 200, 10)).toBe(20);
  });
});

import type { Context } from 'hono';

/** รันงานเบื้องหลังหลังตอบ response (waitUntil) ถ้าไม่มี ExecutionContext (เช่นใน test) ให้รอจนเสร็จ */
export async function background(c: Context, work: Promise<unknown>): Promise<void> {
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    await work;
  }
}

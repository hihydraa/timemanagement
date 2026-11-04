import { vi } from 'vitest';

export interface GEvent {
  id: string;
  [k: string]: unknown;
}

/** จำลอง Google OAuth + Calendar API; ห่อ fetch เดิม (เช่นของ LINE harness) แล้วจัดการเฉพาะโดเมน Google */
export class FakeGoogle {
  events = new Map<string, GEvent>();
  calls: { method: string; path: string; body: unknown; auth: string | null }[] = [];
  validTokens = new Set<string>();
  refreshCount = 0;
  revoked: string[] = [];
  /** ผลลัพธ์ที่จะตอบครั้งถัดไปแทนปกติ (ใช้จำลองข้อผิดพลาด) */
  failNext: { status: number; body?: unknown }[] = [];
  refreshMode: 'ok' | 'invalid_grant' | 'down' = 'ok';
  codeResponse: Record<string, unknown> = {};
  email = 'a@x.com';
  private seq = 0;

  constructor() {
    const prev = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.startsWith('https://oauth2.googleapis.com/token')) return this.token(init);
        if (u.startsWith('https://oauth2.googleapis.com/revoke')) {
          this.revoked.push(new URLSearchParams(String(init?.body)).get('token') ?? '');
          return new Response('{}', { status: 200 });
        }
        if (u.startsWith('https://openidconnect.googleapis.com/v1/userinfo')) {
          return json({ sub: 'sub-1', email: this.email, email_verified: true });
        }
        if (u.startsWith('https://www.googleapis.com/calendar/v3/calendars/'))
          return this.calendar(u, init);
        return prev(url as string, init);
      }),
    );
  }

  private newToken(): string {
    const t = `at-${++this.refreshCount}`;
    this.validTokens.add(t);
    return t;
  }

  /** ทำให้ access token ที่ออกไปแล้วใช้ไม่ได้ (Google ตอบ 401) */
  expireAccessTokens() {
    this.validTokens.clear();
  }

  private token(init?: RequestInit): Response {
    const p = new URLSearchParams(String(init?.body));
    if (p.get('grant_type') === 'authorization_code') {
      return json({
        access_token: this.newToken(),
        refresh_token: 'rt-secret-value',
        expires_in: 3600,
        scope: 'openid email https://www.googleapis.com/auth/calendar.events',
        ...this.codeResponse,
      });
    }
    if (this.refreshMode === 'invalid_grant') return json({ error: 'invalid_grant' }, 400);
    if (this.refreshMode === 'down') return json({ error: 'backend_error' }, 503);
    return json({ access_token: this.newToken(), expires_in: 3600 });
  }

  private calendar(url: string, init?: RequestInit): Response {
    const method = init?.method ?? 'GET';
    const auth = new Headers(init?.headers).get('Authorization');
    const path = url.replace('https://www.googleapis.com/calendar/v3/calendars/', '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const m = /^([^/]+)\/events(?:\/([^/?]+))?$/.exec(path);
    this.calls.push({ method, path, body, auth });
    const token = auth?.replace('Bearer ', '') ?? '';
    if (!this.validTokens.has(token))
      return json({ error: { code: 401, message: 'Invalid Credentials' } }, 401);
    const fail = this.failNext.shift();
    if (fail)
      return json(
        fail.body ?? { error: { code: fail.status, errors: [{ reason: 'forced' }] } },
        fail.status,
      );
    if (!m) return json({}, 404);
    const id = m[2] ? decodeURIComponent(m[2]) : undefined;
    if (method === 'POST' && !id) {
      const ev: GEvent = { ...body, id: `ev${++this.seq}` };
      this.events.set(ev.id, ev);
      return json(ev);
    }
    if (method === 'PATCH' && id) {
      const cur = this.events.get(id);
      if (!cur) return json({ error: { code: 404, errors: [{ reason: 'notFound' }] } }, 404);
      const merged: GEvent = { ...cur };
      for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
        if (v === null) delete merged[k];
        else if (
          typeof v === 'object' &&
          !Array.isArray(v) &&
          typeof cur[k] === 'object' &&
          cur[k] !== null
        ) {
          const inner = {
            ...(cur[k] as Record<string, unknown>),
            ...(v as Record<string, unknown>),
          };
          for (const [ik, iv] of Object.entries(inner)) if (iv === null) delete inner[ik];
          merged[k] = inner;
        } else merged[k] = v;
      }
      this.events.set(id, merged);
      return json(merged);
    }
    if (method === 'DELETE' && id) {
      if (!this.events.has(id))
        return json({ error: { code: 410, errors: [{ reason: 'deleted' }] } }, 410);
      this.events.delete(id);
      return new Response(null, { status: 204 });
    }
    return json({}, 400);
  }

  /** event ล่าสุดทั้งหมดเป็น array */
  get all(): GEvent[] {
    return [...this.events.values()];
  }
  byTask(taskId: string): GEvent | undefined {
    return this.all.find(
      (e) =>
        (e.extendedProperties as { private?: { dobbyTaskId?: string } })?.private?.dobbyTaskId ===
        taskId,
    );
  }
  /** นับการเรียก Calendar API ตาม method */
  count(method: string): number {
    return this.calls.filter((c) => c.method === method).length;
  }
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

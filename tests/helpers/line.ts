import { createHmac } from 'node:crypto';
import { vi } from 'vitest';
import { app } from '../../src/app';
import type { Env } from '../../src/types';

export const sign = (body: string, secret: string) =>
  createHmac('sha256', secret).update(body).digest('base64');

interface Sent {
  replyToken: string;
  messages: Record<string, unknown>[];
}

/** จำลอง LINE: บันทึกทุกข้อความที่บอทตอบ และให้เนื้อหาไฟล์ตาม messageId */
export class LineHarness {
  replies: Sent[] = [];
  fetched: string[] = [];
  contents = new Map<string, { bytes: Uint8Array; type: string }>();
  private n = 0;
  private pending: Promise<unknown>[] = [];

  constructor(private env: Env) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        this.fetched.push(String(url));
        if (String(url).endsWith('/v2/bot/message/reply')) {
          this.replies.push(JSON.parse(String(init?.body)) as Sent);
          return new Response('{}', { status: 200 });
        }
        const m = /message\/([^/]+)\/content$/.exec(String(url));
        if (m) {
          const c = this.contents.get(decodeURIComponent(m[1]!));
          if (!c) return new Response('gone', { status: 404 });
          return new Response(c.bytes, {
            status: 200,
            headers: { 'Content-Type': c.type, 'Content-Length': String(c.bytes.length) },
          });
        }
        return new Response('{}', { status: 200 });
      }),
    );
  }

  /** ส่ง webhook ดิบ (ไม่ใช้ helper ของ event) */
  async post(
    body: string,
    opts: { secret?: string | null; headers?: Record<string, string> } = {},
  ) {
    const secret = opts.secret === undefined ? this.env.LINE_CHANNEL_SECRET : opts.secret;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...opts.headers };
    if (secret !== null) headers['x-line-signature'] = sign(body, secret);
    const ctx = {
      waitUntil: (p: Promise<unknown>) => void this.pending.push(p),
      passThroughOnException() {},
    } as unknown as ExecutionContext;
    const res = await app.request(
      'http://localhost/webhook/line',
      { method: 'POST', headers, body },
      this.env,
      ctx,
    );
    await Promise.all(this.pending);
    this.pending = [];
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }

  private async event(userId: string, ev: Record<string, unknown>, eventId?: string) {
    const id = eventId ?? `evt-${++this.n}`;
    const token = `rt-${id}`;
    const before = this.replies.length;
    const r = await this.post(
      JSON.stringify({
        destination: 'Ubot',
        events: [
          {
            webhookEventId: id,
            replyToken: token,
            source: { type: 'user', userId },
            timestamp: 0,
            mode: 'active',
            ...ev,
          },
        ],
      }),
    );
    return { status: r.status, replies: this.replies.slice(before) };
  }

  say(userId: string, text: string, eventId?: string) {
    return this.event(
      userId,
      { type: 'message', message: { id: `m${++this.n}`, type: 'text', text } },
      eventId,
    );
  }
  postback(userId: string, data: string) {
    return this.event(userId, { type: 'postback', postback: { data } });
  }
  media(userId: string, kind: 'image' | 'file', id: string, fileName?: string) {
    return this.event(userId, {
      type: 'message',
      message: {
        id,
        type: kind,
        ...(fileName ? { fileName } : {}),
        contentProvider: { type: 'line' },
      },
    });
  }
  follow(userId: string) {
    return this.event(userId, { type: 'follow' });
  }
  /** ข้อความล่าสุดที่บอทตอบ (ทุก message ของ reply ล่าสุด) */
  get last(): Record<string, unknown>[] {
    return this.replies.at(-1)?.messages ?? [];
  }
}

export const json = (x: unknown) => JSON.stringify(x);

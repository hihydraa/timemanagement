import { app } from '../../src/app';
import type { Env } from '../../src/types';
import { createTestD1 } from './d1';
import { FakeR2 } from './r2';

export function makeEnv(over: Partial<Env> = {}): Env & { FILES: FakeR2 & R2Bucket } {
  return {
    DB: createTestD1(),
    FILES: new FakeR2() as unknown as FakeR2 & R2Bucket,
    ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
    LINE_CHANNEL_SECRET: '',
    LINE_CHANNEL_ACCESS_TOKEN: '',
    GOOGLE_CLIENT_ID: 'cid',
    GOOGLE_CLIENT_SECRET: 'cs',
    GOOGLE_REDIRECT_URI: 'http://localhost:5173/auth/google/callback',
    SESSION_SECRET: 'test-secret-test-secret-test-secret-32',
    TOKEN_ENC_KEY: '',
    APP_BASE_URL: 'http://localhost:5173',
    ALLOWED_EMAILS: 'a@x.com,b@x.com',
    PUSH_MONTHLY_LIMIT: '200',
    MAX_UPLOAD_MB: '10',
    USER_STORAGE_QUOTA_MB: '500',
    DEV_LOGIN: '1',
    ...over,
  } as Env & { FILES: FakeR2 & R2Bucket };
}

export class Client {
  cookie = '';
  constructor(
    private env: Env,
    private base = 'http://localhost:8787',
  ) {}

  async login(email: string) {
    const res = await app.request(`${this.base}/auth/dev-login?email=${email}`, {}, this.env);
    const sc = res.headers.get('set-cookie') ?? '';
    this.cookie = sc.split(';')[0] ?? '';
    return res;
  }

  /** อัปโหลด multipart (ตั้ง Content-Length เองเพราะ Request ใน Node ไม่คำนวณให้) */
  async upload(
    path: string,
    files: { name: string; data: Uint8Array | string; type?: string }[],
    headers: Record<string, string> = {},
  ) {
    const fd = new FormData();
    for (const f of files) fd.append('files', new File([f.data], f.name, { type: f.type ?? '' }));
    const probe = new Request('http://x', { method: 'POST', body: fd });
    const buf = await probe.arrayBuffer();
    const res = await app.request(
      `${this.base}${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': probe.headers.get('content-type')!,
          'Content-Length': String(buf.byteLength),
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          ...headers,
        },
        body: buf,
      },
      this.env,
    );
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  async download(path: string) {
    const res = await app.request(
      `${this.base}${path}`,
      { headers: this.cookie ? { Cookie: this.cookie } : {} },
      this.env,
    );
    return {
      status: res.status,
      headers: res.headers,
      bytes: new Uint8Array(await res.arrayBuffer()),
    };
  }

  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app.request(
      `${this.base}${path}`,
      {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      this.env,
    );
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
  }
}

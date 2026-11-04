export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  SESSION_SECRET: string;
  TOKEN_ENC_KEY: string;
  APP_BASE_URL: string;
  ALLOWED_EMAILS: string;
  PUSH_MONTHLY_LIMIT: string;
  MAX_UPLOAD_MB: string;
  USER_STORAGE_QUOTA_MB: string;
  /** เฉพาะ dev/test: ชี้ LINE API ไปที่ mock (ค่าเริ่มต้น https://api.line.me / https://api-data.line.me) */
  LINE_API_BASE?: string;
  LINE_API_DATA_BASE?: string;
  /** '1' เปิด /auth/dev-login สำหรับ local เท่านั้น */
  DEV_LOGIN?: string;
}

export type AppEnv = { Bindings: Env; Variables: { userId: string } };

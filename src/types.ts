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
}

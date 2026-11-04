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
  /** อีเมลที่ล็อกอินได้ คั่นด้วย comma; ใส่ * = เปิดสาธารณะ (จำกัดด้วย MAX_USERS) */
  ALLOWED_EMAILS: string;
  /** เพดานจำนวนผู้ใช้ (โหมดเปิดสาธารณะค่าเริ่มต้น 50) */
  MAX_USERS?: string;
  /** เพดานจำนวนงานต่อผู้ใช้ (ค่าเริ่มต้น 3000) */
  MAX_TASKS_PER_USER?: string;
  /** เพดานข้อความ push ต่อผู้ใช้ต่อเดือน (ไม่ตั้ง = แบ่งเท่า ๆ กันจาก PUSH_MONTHLY_LIMIT ÷ จำนวนผู้ใช้ที่ผูก LINE) */
  PUSH_PER_USER_MONTHLY?: string;
  /** อีเมลติดต่อผู้ดูแลระบบ แสดงในหน้านโยบายความเป็นส่วนตัว */
  CONTACT_EMAIL?: string;
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

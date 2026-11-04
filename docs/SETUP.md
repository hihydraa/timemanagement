# Dobby — คู่มือติดตั้ง

## 0. เตรียมเครื่อง

- Node.js 20+ และบัญชี Cloudflare (free plan)
- `npm install`

## 1. Cloudflare D1 และ R2

```bash
npx wrangler login
npx wrangler d1 create dobby
npx wrangler r2 bucket create dobby-files
```

นำ `database_id` ที่ได้ไปใส่ใน `wrangler.toml` (ช่อง `REPLACE_WITH_YOUR_D1_ID`)

> R2 ต้องผูกบัตรเพื่อเปิดใช้ แต่ไม่เสียเงินถ้าไม่เกิน quota ฟรี (10 GB)

## 2. Secrets

Local: `cp .dev.vars.example .dev.vars` แล้วกรอกค่า (**ห้าม commit**)
Production: `npx wrangler secret put <NAME>` สำหรับแต่ละตัวใน `.dev.vars.example`

สร้างค่าสุ่ม:

```bash
openssl rand -base64 32   # SESSION_SECRET, TOKEN_ENC_KEY
```

> ไฟล์แนบ: จำกัดไฟล์ละ `MAX_UPLOAD_MB` (ค่าเริ่มต้น 10), ครั้งละ 5 ไฟล์, รวมต่อผู้ใช้ `USER_STORAGE_QUOTA_MB` (500) ปรับได้ใน `wrangler.toml [vars]`
> Local: wrangler จำลอง R2 ให้เอง ไม่ต้องสร้าง bucket

## 3. รัน local

```bash
npm run db:migrate:local
npm run dev        # เว็บ http://localhost:5173 , API http://localhost:8787
```

### Login แบบ local โดยไม่ต้องมี Google

ใน `.dev.vars` ตั้ง `DEV_LOGIN=1`, `ALLOWED_EMAILS=you@example.com`, `APP_BASE_URL=http://localhost:8787` แล้วรัน `npm run build && npx wrangler dev`
เปิด `http://localhost:8787/auth/dev-login?email=you@example.com` (ห้ามตั้ง `DEV_LOGIN` ใน production)

## 4. LINE OA (Phase 3)

1. สร้าง LINE Official Account ที่ https://manager.line.biz แล้วเปิด **Messaging API** (Settings → Messaging API) ผูกกับ Provider ใน LINE Developers Console
2. ที่ LINE Developers Console → Channel ของคุณ:
   - แท็บ **Basic settings** เก็บ **Channel secret**
   - แท็บ **Messaging API** กด Issue **Channel access token (long-lived)** แล้วเก็บไว้
3. ตั้ง secrets บน Cloudflare:

```bash
npx wrangler secret put LINE_CHANNEL_SECRET
```

```bash
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
```

4. รัน migration ใหม่ของ Phase 3 (เพิ่มตาราง `line_events`, `line_state`) แล้ว deploy ใหม่:

```bash
npm run db:migrate:remote
```

```bash
npm run deploy
```

5. ตั้ง **Webhook URL** = `https://<worker-domain>/webhook/line` เปิด **Use webhook** แล้วกด **Verify** (ต้องขึ้น Success)
6. ใน LINE Official Account Manager → Settings → Response settings: **ปิด** "Auto-reply messages" และ "Greeting messages" (ให้บอทของเราตอบเอง)
7. ตั้ง Rich Menu (เมนู 4 ปุ่มใต้แชท):

```bash
LINE_CHANNEL_ACCESS_TOKEN=<token> APP_BASE_URL=https://<worker-domain> npm run richmenu
```

(ลองดูก่อนได้ด้วย `npm run richmenu -- --dry-run`; เปลี่ยนรูปที่ `scripts/richmenu.png` ขนาด 2500x843) 8. ผูกบัญชี: เปิดเว็บ Dobby → ปุ่ม **เชื่อม LINE** → กด "สร้างรหัสผูกบัญชี" → พิมพ์ในแชท OA ว่า `ผูกบัญชี 123456` (รหัสหมดอายุใน 10 นาที) 9. ทดสอบ: พิมพ์ `ส่งรายงาน พรุ่งนี้ 14:00 #งาน !ด่วน` — ควรได้การ์ดยืนยันและเห็นงานในเว็บ

> บอทตอบด้วย reply token เท่านั้น (ไม่นับโควตา push) การแจ้งเตือนแบบ push จะมาใน Phase 5
> เพิ่ม `LINE_CHANNEL_SECRET` ผิดค่า/ไม่ตั้ง = webhook ตอบ 401 ทุกคำขอ (ตั้งใจ)

## 4b. แจ้งเตือนผ่าน LINE (Phase 5)

ระบบมี Cron ทุก 5 นาที (`wrangler.toml` → `[triggers]`) ที่ส่ง push ให้ผู้ใช้ที่ผูก LINE แล้ว: **สรุปเช้า** (07:30) · **เตือนก่อนเวลา** (30 นาที) · **เตือนเดดไลน์วันนี้** (15:00) · **สรุปเย็น** (20:00, ปิดได้) — ตั้งเวลา/quiet hours ได้ที่ปุ่ม **ตั้งค่า** ในเว็บ

1. รัน migration ใหม่ของ Phase 5 (เพิ่มคอลัมน์ `deadline_alert_time`, `evening_review_enabled`) แล้ว deploy:

```bash
npm run db:migrate:remote
```

```bash
npm run deploy
```

2. **ตั้งโควตา push ให้ตรงกับแพ็กเกจ LINE OA ของคุณ** — เปิด LINE Official Account Manager ดูจำนวนข้อความ push ฟรีต่อเดือน แล้วแก้ `PUSH_MONTHLY_LIMIT` ใน `wrangler.toml` (`[vars]`) แล้ว deploy ใหม่ ค่าที่ใส่ไว้ (200) เป็นค่าตัวอย่าง **ไม่ใช่โควตาจริง** — ถ้าไม่ตั้ง/ตั้งผิดรูปแบบ ระบบจะไม่ส่ง push เลย (ตั้งใจ กันเกินโควตา)
3. ตรวจใน Cloudflare Dashboard → Workers & Pages → dobby → Settings → Triggers ว่ามี Cron `*/5 * * * *`
4. เมื่อโควตาใกล้เต็ม (≥ 80%) เว็บจะขึ้นแบนเนอร์เตือน และเมื่อเต็มจะหยุดส่ง push จนถึงเดือนหน้า (การตอบแชทใน LINE ไม่เสียโควตา)

**หลักการส่ง:** แต่ละประเภทส่ง "วันละครั้ง" ภายใน 2 ชั่วโมงหลังเวลาที่ตั้ง (ไม่ต้องตรงนาที) ไม่ส่งถ้าวันนั้นไม่มีงาน และไม่ส่งในช่วง quiet hours · รวมหลายงานเป็นข้อความเดียว (1 push = นับโควตา 1) · รอบละไม่เกิน 5 push (เพดานของ Worker ฟรี ส่วนที่เหลือไปรอบถัดไป)

**ทดสอบ Cron ในเครื่อง:**

```bash
npx wrangler dev --test-scheduled
```

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*"
```

(wrangler รุ่นปัจจุบันใช้ `/cdn-cgi/handler/scheduled` — ไม่ใช่ `/__scheduled`) ผลดูได้ใน log ของ `wrangler dev` (`notifications run {...}`) และตาราง `notification_log` — ถ้าต้องการลองโดยไม่ยิง LINE จริง ตั้ง `LINE_API_BASE=http://localhost:9999` ใน `.dev.vars` ชี้ไป mock server (ตัวแปรนี้ใช้เฉพาะ dev ห้ามตั้งใน production)

## 5. Google OAuth (login) และ Google Calendar (Phase 1/4)

### 5.1 Login ด้วย Google

1. Google Cloud Console → **Google Auth Platform → Clients → Create client** → Application type **Web application**
2. **Authorized redirect URI** = ค่าเดียวกับ `GOOGLE_REDIRECT_URI` เช่น `https://dobby.<you>.workers.dev/auth/google/callback` (ต้องตรงทุกตัวอักษร) — **ใช้ URI เดียวนี้ทั้ง login และเชื่อม Calendar**
3. เก็บ Client ID / Client secret แล้วตั้ง secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `ALLOWED_EMAILS`

### 5.2 เปิดซิงก์ Google Calendar

1. **เปิด Google Calendar API**: Cloud Console → APIs & Services → Library → "Google Calendar API" → Enable
2. **เพิ่ม scope**: Google Auth Platform → **Data Access → Add or remove scopes** → เพิ่ม `https://www.googleapis.com/auth/calendar.events` (scope เดียวที่ Dobby ขอ) → Save
3. ตั้งคีย์เข้ารหัส token (ต้องเป็นค่าสุ่ม 32 ไบต์แบบ base64 — **เก็บไว้ให้ดี ถ้าเปลี่ยน/ทำหาย ต้องกด "เชื่อมใหม่"**):

```bash
openssl rand -base64 32 | npx wrangler secret put TOKEN_ENC_KEY
```

4. รัน migration ใหม่ของ Phase 4 (เพิ่มคอลัมน์ `tasks.gcal_sync`, `google_tokens.email`) แล้ว deploy:

```bash
npm run db:migrate:remote
```

```bash
npm run deploy
```

5. เปิดเว็บ Dobby → ปุ่ม **Google Calendar** → **เชื่อม Google Calendar** → เลือกบัญชีและกดอนุญาต (ต้องติ๊กสิทธิ์ปฏิทินให้ครบ)
6. กด **Sync ทั้งหมดใหม่** เพื่อส่งงานเดิมที่มีวัน/เวลาไปที่ปฏิทิน (ทำทีละชุด ๆ ละ 10 งาน เพราะ Worker ฟรีจำกัดจำนวนคำขอต่อครั้ง)
7. ทดสอบ: สร้างงานมีเวลาในเว็บ หรือพิมพ์ใน LINE → ควรเห็น event ใน Google Calendar ถูกวัน/เวลา (เขตเวลา Asia/Bangkok)

**พฤติกรรมการซิงก์** (ทางเดียว Dobby → Google): สร้าง/แก้ไข/เลื่อน → สร้าง/อัปเดต event · ทำเสร็จ → ชื่อ event นำหน้า `✅` · ยกเลิกหรือลบงาน (หรือเอาวัน/เวลาออก) → ลบ event · งานที่ไม่มีวัน/เวลา (Inbox) ไม่ซิงก์ · ปิดซิงก์รายงานได้ที่สวิตช์ในฟอร์มงาน

### 5.3 สถานะ consent screen และอายุ token

- **Testing**: ต้องเพิ่มอีเมลใน _Test users_ และ refresh token ของ Calendar **หมดอายุทุก 7 วัน** (ต้องกดเชื่อมใหม่) — ใช้แค่ลองระบบ
- **In production** (Audience → Publish app): token ไม่หมดอายุทุก 7 วัน แอปที่ยังไม่ verify จะขึ้นหน้า "Google hasn't verified this app" (กด _Advanced → Go to Dobby_) และรับผู้ใช้ได้ไม่เกิน 100 คน — เหมาะกับใช้ส่วนตัว/คนใกล้ตัว
- ถ้าจะเปิดสาธารณะ ต้องผ่านการ verify ของ Google (ต้องมี privacy policy และโดเมนของคุณเอง `workers.dev` ใช้ยืนยันไม่ได้)
- ถ้าผู้ใช้เพิกถอนสิทธิ์ที่ https://myaccount.google.com/permissions Dobby จะแสดงสถานะ "ต้องเชื่อมใหม่" และงานยังบันทึกได้ตามปกติ

## 6. Deploy

```bash
npm run db:migrate:remote
npm run deploy
```

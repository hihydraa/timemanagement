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

## 4d. แจ้งเตือนในเว็บ/เบราว์เซอร์ (Web Push — ไม่เสียโควตา LINE)

1. สร้างกุญแจ VAPID (ครั้งเดียว): `node scripts/gen-vapid.mjs` จะพิมพ์ `VAPID_PUBLIC_KEY` และ `VAPID_PRIVATE_KEY`
2. ตั้งเป็น secret: `npx wrangler secret put VAPID_PUBLIC_KEY` และ `npx wrangler secret put VAPID_PRIVATE_KEY` (วางค่าที่ได้) — **อย่า commit/แชร์** (local ใส่ใน `.dev.vars`)
3. รัน migration `npm run db:migrate:remote` (ตาราง `push_subscriptions`) แล้ว `npm run deploy`
4. ผู้ใช้เปิดที่ "ฉัน → ตั้งค่า → แจ้งเตือนในเว็บ" ต่ออุปกรณ์ (มือถือ: เปิดเว็บแล้ว "เพิ่มไปยังหน้าจอโฮม" ก่อน โดยเฉพาะ iPhone/iPad ต้องติดตั้งเป็นแอปจึงจะรองรับ)
- ส่งสรุปเช้า / เตือนก่อนนัดที่กำหนดเวลา / สรุปเย็น (ถ้าเปิด) ตามเวลาที่ตั้ง + quiet hours เดียวกับ LINE; ไม่ตั้ง VAPID = ฟีเจอร์ปิด (หน้าตั้งค่าบอกว่ายังไม่ได้ตั้งค่า)
- รับได้เฉพาะ push service ของ Chrome/Edge (FCM), Firefox, Safari, Windows; ลบ subscription อัตโนมัติเมื่อ push service ตอบว่าใช้ไม่ได้แล้ว

## 4c. ฟีเจอร์ช่วยบริหารเวลา (Phase 6)

ไม่ต้องตั้งค่าเพิ่ม แต่ต้องรัน migration ใหม่ (เพิ่มคอลัมน์ `tasks.recurrence_id`, ตาราง `subtasks` และดัชนีของซีรีส์ — ปลอดภัยกับข้อมูลเดิม):

```bash
npm run db:migrate:remote
```

```bash
npm run deploy
```

หน้าที่เพิ่ม (แท็บด้านบนของเว็บ): **Inbox** · **Matrix** (Eisenhower) · **โฟกัส** (Pomodoro) · **รีวิว** (รายสัปดาห์) · **สถิติ** · เมนู **ส่งออกข้อมูล** (JSON/CSV/ICS)

- **งานทำซ้ำ:** ตั้งในฟอร์มงาน (ทุกวัน/สัปดาห์/เดือน, ทุก N, เลือกวัน, ถึงวันที่) หรือพิมพ์ใน LINE เช่น `ประชุมทีม ทุกวันจันทร์ 9:00` — แก้ที่ครั้งหนึ่ง = แก้เฉพาะครั้งนั้น, แก้ที่ "งานแม่" (ปุ่ม _แก้ทั้งซีรีส์_) = แก้ทั้งซีรีส์
- **Google Calendar:** งานทำซ้ำส่งเป็น event ที่มี RRULE ครั้งที่แก้/ยกเลิกเฉพาะครั้งจะส่งเป็น event แยก + EXDATE (กดเชื่อมใหม่หรือ "Sync ทั้งหมดใหม่" หลังอัปเดตเพื่อให้ event เดิมมี EXDATE)
- **นำเข้า ICS:** ไฟล์ `.ics` ที่ส่งออกนำเข้า Google Calendar / Apple / Outlook ได้ (เป็นสแนปช็อตครั้งเดียว ไม่ซิงก์ต่อเนื่อง)

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

### Deploy จริง (Phase 7)

1. ตั้ง `database_id` และ `APP_BASE_URL` (https) ใน `wrangler.toml`, ตั้ง `PUSH_MONTHLY_LIMIT` ตามโควตา LINE OA
2. `npm run db:migrate:remote` (จะใช้ migration 0004–0005 ด้วย; 0005 สร้างตาราง `rate_limits`)
3. ตั้ง secrets ด้วย `wrangler secret put` ทั้งหมด (`SESSION_SECRET` ต้อง ≥ 32 ตัวอักษร)
4. `npm run deploy` — ถ้ายังเป็นค่า placeholder สคริปต์ตรวจจะหยุดก่อน
5. Google Cloud Console → OAuth consent screen → **Publish app** (ไม่งั้น refresh token หมดอายุทุก 7 วัน)
6. รัน Lighthouse (mobile) บนโดเมนจริงเพื่อยืนยัน

## 7. เปิดให้สาธารณะ (หลายคนใช้งาน)

ค่าเริ่มต้นคือใช้ส่วนตัว (เฉพาะอีเมลใน `ALLOWED_EMAILS`) ถ้าจะให้ใครก็สมัครด้วย Google ได้:

1. ตั้ง `ALLOWED_EMAILS` เป็น `*`

```bash
npx wrangler secret put ALLOWED_EMAILS
```

2. ใน `wrangler.toml` `[vars]` กำหนดเพดานให้เหมาะกับโควตาฟรี (เอาเครื่องหมาย `#` ออก) แล้ว `npm run deploy`: `MAX_USERS` (ค่าเริ่มต้นโหมดเปิด = 50), `MAX_TASKS_PER_USER` (3000), `PUSH_PER_USER_MONTHLY` (ไม่ตั้ง = แบ่งโควตา push ของ OA เท่า ๆ กันตามจำนวนผู้ใช้ที่ผูก LINE), `USER_STORAGE_QUOTA_MB` และ `CONTACT_EMAIL` (อีเมลติดต่อที่แสดงใน `/privacy`)
3. ตรวจ `/privacy` และ `/terms` ว่าอ่านได้โดยไม่ต้องล็อกอิน และ **ให้ที่ปรึกษากฎหมายตรวจเนื้อหา** (เป็นเอกสารตั้งต้นที่ตรงกับสิ่งที่ระบบทำ ไม่ใช่คำแนะนำทางกฎหมาย)

### ขีดจำกัดที่ต้องรู้ (Free tier)

| ทรัพยากร     | ขีดจำกัดฟรี                                                                                | ผลต่อการเปิดสาธารณะ                                                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LINE push    | โควตาต่อเดือนของ **OA เดียว** แชร์ทุกคน                                                    | แบ่งส่วนแบ่งต่อคนอัตโนมัติ; ผู้ใช้เยอะ = ได้แจ้งเตือนต่อคนน้อยลง (ตอบแชทไม่นับโควตา)                                                                                                                                                |
| R2           | 10 GB รวมทั้งระบบ                                                                          | ผู้ใช้ × `USER_STORAGE_QUOTA_MB` ต้องไม่เกิน 10 GB (เช่น 50 คน × 100 MB)                                                                                                                                                            |
| D1           | เขียน 100,000 แถว/วัน, อ่าน 5 ล้านแถว/วัน                                                  | เพดานผู้ใช้/จำนวนงานช่วยกันเกิน                                                                                                                                                                                                     |
| Worker       | 100,000 คำขอ/วัน                                                                           | ดูการใช้ใน Cloudflare Dashboard                                                                                                                                                                                                     |
| Google OAuth | แอปที่ยังไม่ผ่าน verification จำกัด ~100 ผู้ใช้ และขึ้นหน้าเตือน (เฉพาะตอนเชื่อม Calendar) | ล็อกอินใช้ scope พื้นฐาน ไม่ต้อง verify; ถ้าจะให้ผู้ใช้เชื่อม Calendar เกิน 100 คน ต้องขอ verify scope `calendar.events` ซึ่งต้องมี **โดเมนของคุณเอง** (workers.dev ใช้ยืนยันไม่ได้), หน้า privacy/terms (มีให้แล้ว) และวิดีโอสาธิต |

### สำหรับผู้ดูแลระบบ

- จำนวนผู้ใช้: `npx wrangler d1 execute dobby --remote --command "select count(*) from users"`
- ผู้ใช้ลบบัญชีเองได้ที่ เมนู → ตั้งค่า → ลบบัญชีและข้อมูลทั้งหมด (ลบ D1 + R2 + เพิกถอนสิทธิ์ Google)
- ปิดรับสมัครใหม่โดยไม่กระทบผู้ใช้เดิม: ตั้ง `MAX_USERS` เท่าจำนวนปัจจุบัน

### อัปเกรดเป็นรุ่นที่มีหน้า "วันนี้" (UX Step 2)

มี migration ใหม่ (0007: ชั่วโมงทำงาน + จำนวนครั้งที่เลื่อนงาน) — ปลอดภัยกับข้อมูลเดิม (เพิ่มคอลัมน์พร้อมค่าเริ่มต้น) รันก่อน deploy:

```bash
npm run db:migrate:remote
```

ตั้งชั่วโมงทำงานที่ เมนู → ตั้งค่า → ชั่วโมงทำงาน (ค่าเริ่มต้น 09:00–18:00 จันทร์–ศุกร์)

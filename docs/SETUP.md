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

## 5. Google OAuth + Calendar (Phase 1/4)

1. Google Cloud Console → สร้าง OAuth client (Web) เปิด Google Calendar API
2. Redirect URI = `GOOGLE_REDIRECT_URI`
3. **เปลี่ยน consent screen เป็น "In production"** — ถ้าค้าง "Testing" refresh token จะหมดอายุทุก 7 วัน (แอปส่วนตัวใช้ได้แม้ขึ้นหน้าเตือน unverified)
4. ตั้ง `ALLOWED_EMAILS` เป็นอีเมลของคุณ

## 6. Deploy

```bash
npm run db:migrate:remote
npm run deploy
```

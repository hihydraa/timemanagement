# CLAUDE.md — Dobby: ระบบ Time Management (Web App + LINE OA + Google Calendar)

> ไฟล์นี้คือ spec + แนวทางการทำงานสำหรับ Claude Code
> อ่านทั้งไฟล์ก่อนเริ่ม แล้วทำงานตามลำดับ Phase ในหัวข้อ 12 ทีละ Phase
> ห้ามข้าม Phase และทุก Phase ต้องผ่าน Acceptance Criteria ก่อนไปต่อ

---

## 1. เป้าหมายโปรเจกต์

สร้างระบบวางแผนงานประจำวันส่วนตัว (รองรับหลายผู้ใช้ในอนาคต) ที่ประกอบด้วย:

1. **Web App** แสดงงานเป็นปฏิทิน (วัน / สัปดาห์ / เดือน / รายการ) แนบไฟล์ได้ แยกสีตามความเร่งด่วน ความสำคัญ และประเภทงาน
2. **LINE OA Chatbot** พิมพ์ข้อความหา OA แล้วบันทึกงานลงระบบได้ทันที
3. **Google Calendar Sync** เพิ่ม/แก้/ลบงานแล้วสะท้อนไปที่ Google Calendar
4. **LINE Notification** แจ้งเตือนงานวันนี้ (สรุปตอนเช้า), เดดไลน์วันนี้, งานเลยกำหนด และสรุปตอนเย็น
5. **ฟีเจอร์ช่วยบริหารเวลา** (Eisenhower Matrix, Focus Timer, Weekly Review, Recurring ฯลฯ)

ภาษาของ UI และข้อความ LINE: **ไทยเป็นหลัก** (โค้ด/คอมเมนต์/ชื่อตัวแปรเป็นอังกฤษ)
เขตเวลา: **Asia/Bangkok (UTC+7)** เสมอ

---

## 2. ข้อจำกัดสำคัญ: ต้องรันบน Free Tier เท่านั้น

| เรื่อง | การตัดสินใจ | เหตุผล |
|---|---|---|
| Hosting + API | **Cloudflare Workers** (static assets + Hono API ใน Worker เดียว) | ฟรี, มี Cron Triggers, ไม่มี cold start แย่ |
| Database | **Cloudflare D1** (SQLite) + **Drizzle ORM** | ฟรี, เข้ากับ Workers |
| ไฟล์แนบ | **Cloudflare R2** | ฟรี 10 GB (ต้องผูกบัตรเพื่อเปิดใช้ แต่ไม่เสียเงินถ้าไม่เกิน quota) |
| Scheduler | **Workers Cron Triggers** | ฟรี ใช้ยิงแจ้งเตือน |
| Frontend | **React + Vite + TypeScript + Tailwind + FullCalendar** | |
| NL Parser (ทางเลือก) | **Workers AI** (free daily quota) เป็น fallback | ใช้เมื่อ rule-based parse ไม่ได้ |

**ทำไมไม่ใช้ Vercel เป็นหลัก:** Vercel Hobby จำกัด Cron ได้น้อยมาก (ราว 1 ครั้ง/วัน) ซึ่งไม่พอสำหรับแจ้งเตือนตามเวลา
**Netlify:** ใช้ได้ถ้าต้องการ แต่ให้ยึด Cloudflare เป็นแผนหลักเพื่อให้ทั้งระบบอยู่ที่เดียว

**ข้อควรระวังเรื่อง LINE OA ฟรี:**
- Reply message (ตอบกลับภายในการสนทนา) ไม่จำกัดและไม่นับโควตา
- **Push message มีโควตารายเดือนจำกัด** (ขึ้นกับแพ็กเกจ/ประเทศ ตรวจสอบโควตาปัจจุบันใน LINE Official Account Manager)
- ดังนั้นต้องออกแบบให้ **รวมแจ้งเตือนเป็น Digest ข้อความเดียวต่อรอบ** ไม่ push ทีละงาน
- ต้องมีตัวนับ push ต่อเดือนในตาราง `notification_log` และหยุด push เมื่อใกล้เต็ม (ค่า `PUSH_MONTHLY_LIMIT` ตั้งใน env) พร้อมแจ้งเตือนในเว็บ

---

## 3. สถาปัตยกรรม

```
┌──────────────┐        ┌─────────────────────────────────────────┐
│  Browser     │◀──────▶│ Cloudflare Worker (Hono)                │
│  (React PWA) │  REST  │  /api/*   → REST API                    │
└──────────────┘        │  /webhook/line → LINE Webhook           │
                        │  /auth/*  → Google OAuth                │
┌──────────────┐        │  scheduled() → Cron (reminders/digest)  │
│  LINE App    │◀──────▶│                                         │
│  (LINE OA)   │ webhook│  Bindings: D1, R2, (AI)                 │
└──────────────┘        └───────┬─────────────┬───────────────────┘
                                │             │
                         ┌──────▼─────┐  ┌────▼──────────────┐
                         │ D1 / R2    │  │ Google Calendar   │
                         └────────────┘  │ API (OAuth2)      │
                                         └───────────────────┘
```

โครงสร้าง repo (monorepo แบบเรียบง่าย):

```
dobby/
├─ CLAUDE.md
├─ package.json            # npm workspaces
├─ wrangler.toml
├─ drizzle.config.ts
├─ migrations/             # SQL จาก drizzle-kit
├─ apps/
│  └─ web/                 # React + Vite
│     └─ src/{pages,components,lib,hooks}
├─ src/                    # Worker (Hono)
│  ├─ index.ts             # fetch + scheduled entry
│  ├─ routes/{tasks,categories,attachments,auth,line,settings,stats}.ts
│  ├─ services/
│  │  ├─ line.ts           # verify signature, reply, push, flex builders
│  │  ├─ parser.ts         # Thai NL parser (rule-based)
│  │  ├─ googleCalendar.ts # OAuth + event sync
│  │  ├─ reminders.ts      # cron logic
│  │  └─ recurrence.ts
│  ├─ db/{schema.ts,client.ts}
│  ├─ lib/{crypto.ts,time.ts,session.ts}
│  └─ types.ts
└─ tests/                  # vitest
```

---

## 4. Data Model (Drizzle / D1)

เวลาทั้งหมดเก็บเป็น **ISO 8601 UTC string** ยกเว้นงานแบบ all-day เก็บเป็น `YYYY-MM-DD` ใน field แยก

```
users
  id (text pk, uuid), email, name, google_sub (unique),
  line_user_id (nullable, unique), timezone default 'Asia/Bangkok',
  created_at

user_settings
  user_id pk, morning_digest_time default '07:30', evening_review_time default '20:00',
  remind_before_minutes default 30, quiet_hours_start '22:00', quiet_hours_end '06:30',
  line_notify_enabled default 1, gcal_sync_enabled default 0,
  gcal_calendar_id default 'primary'

google_tokens
  user_id pk, refresh_token_enc, access_token_enc, expires_at, scope
  -- เข้ารหัสด้วย AES-GCM (key จาก secret TOKEN_ENC_KEY) ห้ามเก็บ plaintext

categories
  id, user_id, name, color (hex), icon, sort_order
  -- default: งาน, ส่วนตัว, เรียน, สุขภาพ, การเงิน, ครอบครัว

tasks
  id (uuid), user_id, title, description,
  category_id (nullable),
  urgency   int  -- 1..4  (1=ต่ำ, 4=ด่วนมาก)
  importance int -- 1..4
  status    text -- 'todo' | 'doing' | 'done' | 'cancelled'
  all_day   int,
  start_at  text (nullable), end_at text (nullable),   -- สำหรับงานที่มีช่วงเวลา
  due_at    text (nullable),                            -- เดดไลน์
  due_date  text (nullable)                             -- กรณี all-day
  estimate_minutes int (nullable),
  recurrence_rule text (nullable),    -- RRULE subset: FREQ=DAILY|WEEKLY|MONTHLY;INTERVAL;BYDAY;UNTIL
  parent_task_id (nullable),          -- subtask / instance ของ recurring
  gcal_event_id (nullable), gcal_synced_at (nullable),
  source text   -- 'web' | 'line'
  completed_at, created_at, updated_at

task_tags       (task_id, tag)
attachments     (id, task_id, user_id, r2_key, filename, mime, size_bytes, created_at)
reminders       (id, task_id, remind_at text, sent_at nullable, kind 'before'|'due'|'overdue')
notification_log (id, user_id, channel 'line_push', kind, sent_at, ok int, detail)
line_link_codes (code pk, user_id, expires_at)
focus_sessions  (id, user_id, task_id nullable, started_at, ended_at, minutes)
```

ทำ index: `tasks(user_id, due_at)`, `tasks(user_id, start_at)`, `tasks(user_id, status)`, `reminders(sent_at, remind_at)`

---

## 5. Web App — Requirements

### 5.1 หน้าหลัก (Calendar)
- ใช้ **FullCalendar** (`dayGrid`, `timeGrid`, `list`, `interaction`) มุมมอง: **วันนี้ / สัปดาห์ / เดือน / รายการ (Agenda)**
- ลาก-วางเพื่อย้ายเวลา, ลากขอบเพื่อปรับระยะเวลา, คลิกช่องว่างเพื่อสร้างงานใหม่
- ปุ่ม "วันนี้", ไฮไลต์วันปัจจุบัน, สัปดาห์เริ่มวันจันทร์ (ตั้งค่าได้)
- Sidebar ซ้าย: Mini calendar, ตัวกรอง (ประเภท / ความเร่งด่วน / ความสำคัญ / สถานะ / แท็ก), ค้นหา
- แผงขวา "วันนี้": รายการงานวันนี้เรียงตามเวลา, งานเลยกำหนด (แดง), เดดไลน์วันนี้, ปุ่มติ๊กเสร็จเร็ว

### 5.2 ระบบสี (ต้องเข้าใจได้ในพริบตา และไม่พึ่งสีอย่างเดียว)
- **สีพื้นของ event = ประเภทงาน (category color)**
- **ขอบซ้ายหนา/แถบ = ความเร่งด่วน**: 4 แดง, 3 ส้ม, 2 เหลือง, 1 เทา
- **ไอคอน/Badge = ความสำคัญ**: ★★★★ หรือป้าย P1–P4
- งานเสร็จ: ขีดฆ่า + opacity ต่ำ
- มี **Legend** ที่มุมจอ และผู้ใช้ปรับสี category ได้
- ผู้ใช้เลือกโหมด "ย้อมสีตาม": ประเภท | ความเร่งด่วน | ความสำคัญ ได้ (toggle) เพื่อให้ตรงกับที่อยากเห็นในช่วงนั้น
- รองรับ Dark mode และ contrast ผ่าน WCAG AA

### 5.3 ฟอร์มสร้าง/แก้ไขงาน (Drawer / Modal)
ชื่อ, รายละเอียด (markdown เบา ๆ), ประเภท, ความเร่งด่วน, ความสำคัญ, วันที่-เวลาเริ่ม/จบ, เดดไลน์, all-day, เวลาที่ใช้โดยประมาณ, แท็ก, ทำซ้ำ (recurrence), แจ้งเตือนล่วงหน้า (เลือกได้หลายค่า), subtask checklist, **แนบไฟล์** (drag & drop หลายไฟล์), สวิตช์ "ซิงก์ไป Google Calendar"

### 5.4 ไฟล์แนบ
- อัปโหลดผ่าน Worker → R2 (จำกัดไฟล์ละ ≤ 10 MB, รวมต่อผู้ใช้ตั้ง quota ใน env, whitelist mime: pdf, ภาพ, docx, xlsx, pptx, txt, csv, zip)
- ดาวน์โหลดผ่าน endpoint ที่ตรวจสิทธิ์เจ้าของ (ห้ามเปิด R2 เป็น public)
- แสดง thumbnail รูป, ไอคอนไฟล์อื่น, ลบได้

### 5.5 หน้าอื่น ๆ
- **Inbox**: งานที่ยังไม่กำหนดวัน (เช่นที่ส่งจาก LINE โดยไม่ระบุเวลา) พร้อมปุ่ม "จัดลงปฏิทิน"
- **Eisenhower Matrix**: 4 ช่อง (ด่วน/ไม่ด่วน × สำคัญ/ไม่สำคัญ) ลากย้ายระหว่างช่องเพื่อปรับค่า
- **Focus Timer**: Pomodoro (25/5 ปรับได้) ผูกกับงาน บันทึกลง `focus_sessions`
- **Weekly Review**: สรุปสัปดาห์ที่ผ่านมา (เสร็จกี่งาน, เลยกำหนด, เวลาที่ใช้ตามประเภท) + ช่องวางแผนสัปดาห์หน้า
- **Stats**: กราฟ completion rate, สัดส่วนเวลาตามประเภท, streak
- **Settings**: เวลา digest, quiet hours, เชื่อม LINE (แสดงรหัสผูกบัญชี), เชื่อม Google Calendar, จัดการประเภท/สี, export ข้อมูล (JSON/CSV/ICS)
- **PWA**: manifest + service worker (offline อ่านอย่างเดียว), ติดตั้งบนมือถือได้, responsive มือถือก่อน (mobile-first)

---

## 6. LINE OA Integration

### 6.1 Setup ที่ผู้ใช้ต้องทำเอง (ให้ Claude Code เขียนเป็นคู่มือใน `docs/SETUP.md`)
1. สร้าง LINE Official Account → เปิด Messaging API ใน LINE Developers Console
2. เก็บ **Channel secret** และออก **Channel access token (long-lived)**
3. ตั้ง Webhook URL = `https://<worker-domain>/webhook/line` และเปิด "Use webhook"
4. ปิด "Auto-reply messages" และ "Greeting messages" ใน OA Manager (ให้บอทเราตอบเอง)

### 6.2 Webhook (`POST /webhook/line`)
- **ต้อง verify `x-line-signature`** ด้วย HMAC-SHA256 (key = channel secret, body = raw request body, เทียบเป็น base64) แบบ constant-time ก่อนทำอะไรทั้งหมด ถ้าไม่ผ่านตอบ 401
- ตอบ 200 เร็ว แล้วประมวลผลต่อด้วย `ctx.waitUntil()`
- กัน event ซ้ำด้วย `webhookEventId` (เก็บใน D1 หรือ KV/Cache สั้น ๆ)
- รองรับ event: `message` (text), `postback`, `follow`, `unfollow`

### 6.3 การผูกบัญชี LINE ↔ ผู้ใช้เว็บ
- ในหน้า Settings กด "เชื่อม LINE" → สร้างรหัส 6 หลัก หมดอายุ 10 นาที (`line_link_codes`)
- ผู้ใช้พิมพ์ในแชท OA: `ผูกบัญชี 123456` → บันทึก `users.line_user_id`
- ถ้ายังไม่ผูกบัญชี ให้ตอบวิธีผูก ไม่บันทึกงาน
- ถ้ามี `line_user_id` อื่นพยายามใช้รหัสซ้ำ ให้ปฏิเสธ

### 6.4 คำสั่งและการเพิ่มงานด้วยข้อความธรรมชาติ
ข้อความที่ไม่ใช่คำสั่ง = **สร้างงานใหม่** โดยผ่าน parser (หัวข้อ 7)

| พิมพ์ | ผลลัพธ์ |
|---|---|
| `ส่งรายงาน พรุ่งนี้ 14:00 #งาน !ด่วน` | สร้างงาน + ตอบ Flex Message ยืนยัน พร้อมปุ่ม แก้ไข / ลบ / เสร็จ |
| `วันนี้` / `งานวันนี้` | สรุปงานวันนี้ |
| `พรุ่งนี้` | งานพรุ่งนี้ |
| `สัปดาห์นี้` | งานสัปดาห์นี้แยกรายวัน |
| `ค้างอยู่` / `เลยกำหนด` | งานเลยกำหนด |
| `เสร็จ <ชื่อ/เลข>` | ทำเครื่องหมายเสร็จ |
| `เลื่อน <ชื่อ/เลข> พรุ่งนี้` | เลื่อนกำหนด |
| `ลบ <ชื่อ/เลข>` | ลบ (ถามยืนยันด้วย postback) |
| `ช่วยเหลือ` | แสดงวิธีใช้ |
| `เปิดแจ้งเตือน` / `ปิดแจ้งเตือน` | toggle |
| ส่ง **รูป/ไฟล์** หลังสร้างงาน | แนบเข้างานล่าสุด (ผ่าน LINE Content API → R2) ภายใน 10 นาทีหลังสร้างงาน หรือถามว่าจะแนบกับงานไหน |

- ข้อความตอบกลับใช้ **reply token** (ไม่เสียโควตา push) ทุกครั้งที่เป็นไปได้
- งานที่ parser จับเวลาไม่ได้ → เข้า **Inbox** และตอบว่า "บันทึกไว้ใน Inbox แล้ว ต้องการกำหนดวันไหม?" พร้อม Quick Reply (วันนี้ / พรุ่งนี้ / สัปดาห์หน้า)
- แสดง Quick Reply สำหรับตอบเร็ว, ใช้ **Rich Menu** (ตั้งผ่านสคริปต์ `scripts/setup-richmenu.ts`) ปุ่ม: งานวันนี้ / เพิ่มงาน / สัปดาห์นี้ / เปิดเว็บ (LIFF หรือ URL)

### 6.5 การแจ้งเตือน (Push) — ดู Cron ในหัวข้อ 8
ใช้ **Flex Message** แสดงรายการ มีปุ่ม postback: ✅ เสร็จ, ⏰ เลื่อน 1 ชม./พรุ่งนี้, 🔗 เปิดในเว็บ

---

## 7. Thai Natural Language Parser (`src/services/parser.ts`)

Rule-based ก่อน (เร็ว ฟรี ทดสอบได้) แล้วค่อย fallback ไป Workers AI เมื่อความมั่นใจต่ำ

**Input:** ข้อความ, `now` (Asia/Bangkok) → **Output:** `{ title, date?, time?, endTime?, due?, category?, urgency?, importance?, tags[], estimateMinutes?, recurrence?, confidence }`

ต้องรองรับอย่างน้อย:
- **วัน:** วันนี้, พรุ่งนี้, มะรืน, วันจันทร์…วันอาทิตย์ (+ "หน้า" = สัปดาห์ถัดไป), `15 พ.ย.`, `15/11`, `15 พฤศจิกายน`, `อีก 3 วัน`, `สิ้นเดือน`, ปี พ.ศ. (แปลงเป็น ค.ศ. ถ้าปี > 2400)
- **เวลา:** `14:00`, `14.30`, `2 โมงเช้า`, `บ่าย 2`, `บ่ายสองโมง`, `4 ทุ่ม`, `เที่ยง`, `ตี 5`, `14:00-15:30`, `ภายใน 17:00` (= เดดไลน์)
- **คำบอกเดดไลน์:** `เดดไลน์`, `ส่งภายใน`, `due`, `ก่อน`
- **ความเร่งด่วน:** `!ด่วน`, `!ด่วนมาก`, `!u1..!u4` / **ความสำคัญ:** `!สำคัญ`, `!p1..!p4`
- **ประเภท:** `#งาน`, `#ส่วนตัว` (จับคู่กับชื่อ category ของผู้ใช้ แบบ fuzzy)
- **แท็ก:** `@แท็ก`
- **ระยะเวลา:** `2 ชม.`, `30 นาที`
- **ทำซ้ำ:** `ทุกวัน`, `ทุกวันจันทร์`, `ทุกสัปดาห์`, `ทุกเดือน`
- ตัดส่วนที่จับได้ออกจากหัวข้อ แล้วเหลือส่วนที่เป็น title
- ถ้าไม่ระบุเวลาแต่มีวัน → all-day
- ถ้า parse ได้วันที่ผ่านมาแล้ว (เช่นเวลาวันนี้ที่ผ่านไปแล้ว) ให้ถามยืนยันแทนการเดา

**ต้องมี unit test ≥ 40 เคส** (vitest) ครอบคลุมรูปแบบข้างต้น โดย freeze เวลา `now` เป็นค่าคงที่ (Asia/Bangkok)

---

## 8. Scheduler (Cron Triggers)

ใน `wrangler.toml` (cron ทำงานเป็น UTC; Bangkok = UTC+7):

```toml
[triggers]
crons = [
  "*/5 * * * *",   # ตรวจ reminder ที่ถึงเวลา
  "0 * * * *"      # ตรวจ digest ตามเวลาของผู้ใช้ (เช้า/เย็น) ทุกชั่วโมงและครึ่งชั่วโมงให้เทียบกับ settings
]
```

> ข้อแนะนำ: ใช้ cron `*/5` ตัวเดียวก็ได้ แล้วในโค้ดเช็คว่าตรงเวลา digest ของผู้ใช้ (ตามที่ตั้ง `morning_digest_time`) และยังไม่เคยส่งวันนี้ (ดู `notification_log`) เพื่อให้ตั้งเวลาได้ละเอียดโดยไม่ต้องแก้ cron

`scheduled()` handler ทำ 3 งาน:

1. **Morning Digest** (ค่าเริ่มต้น 07:30): รวม "งานวันนี้" + "เดดไลน์วันนี้" + "เลยกำหนดค้างอยู่" เป็น **ข้อความเดียว** (Flex Carousel หรือ bubble เดียวที่ยาว) เรียงตามความเร่งด่วน×ความสำคัญ ถ้าวันนี้ไม่มีงานให้ **ไม่ส่ง** (ประหยัดโควตา)
2. **Reminder ก่อนเวลา**: งานที่มี `start_at` หรือ `due_at` ใน `remind_before_minutes` ข้างหน้า → ส่งครั้งเดียว (บันทึก `sent_at` กันซ้ำ) ถ้ามีหลายงานในรอบเดียวกันให้รวมเป็นข้อความเดียว
3. **Deadline วันนี้**: ช่วงบ่าย (ค่าเริ่มต้น 15:00) เตือนเดดไลน์วันนี้ที่ยังไม่เสร็จ
4. **Evening Review** (ค่าเริ่มต้น 20:00, ปิดได้): สรุปสิ่งที่ทำเสร็จ/ที่ค้าง + ปุ่ม "เลื่อนงานค้างไปพรุ่งนี้"

กติกา: เคารพ **quiet hours**, เคารพ `line_notify_enabled`, ตรวจโควตา push ก่อนส่งทุกครั้ง, ถ้า LINE API ตอบ error ให้ log ลง `notification_log` และ retry ไม่เกิน 2 ครั้ง

---

## 9. Google Calendar Sync

- **OAuth2 (Authorization Code + refresh token)** scope เท่าที่จำเป็น: `https://www.googleapis.com/auth/calendar.events` (+ `openid email profile` สำหรับ login)
- ใช้ `access_type=offline`, `prompt=consent`, ตรวจ `state` กัน CSRF, เก็บ token แบบเข้ารหัส AES-GCM
- **ทิศทางซิงก์ (MVP): App → Google** (แอปเราเป็น source of truth)
  - สร้างงานที่เปิด sync → `events.insert` เก็บ `gcal_event_id`
  - แก้ไข → `events.patch`; ลบ/ยกเลิก → `events.delete`; ทำเสร็จ → เติมคำนำหน้า `✅` ในชื่อ event
  - งาน all-day → ใช้ `start.date/end.date` (end เป็น exclusive วันถัดไป), งานมีเวลา → `dateTime` พร้อม `timeZone: Asia/Bangkok`
  - ใส่ `reminders.overrides` ตามที่ผู้ใช้ตั้ง, ใส่ลิงก์กลับมาที่ task ใน description
  - handle 401 → refresh token อัตโนมัติ, 404/410 ตอนแก้ไข → สร้างใหม่
  - คำสั่งจาก LINE ที่สร้างงานต้องซิงก์ด้วย (ถ้าผู้ใช้เปิด `gcal_sync_enabled`)
- **Phase ท้าย (optional): Google → App (อ่านอย่างเดียว)** ดึง event จาก Google มาแสดงเป็นชั้นสีเทาในปฏิทินเพื่อกันนัดซ้อน (poll ตอนเปิดหน้าเว็บ ไม่ต้องใช้ webhook)
- **หมายเหตุสำหรับผู้ใช้ (ใส่ใน SETUP.md):** ถ้า OAuth consent screen ค้างสถานะ "Testing" refresh token จะหมดอายุทุก 7 วัน → ให้เปลี่ยนเป็น "In production" (แอปส่วนตัวใช้ได้แม้ขึ้นหน้าเตือน unverified)

---

## 10. API (Hono)

ทุก route ใน `/api/*` ต้องผ่าน auth middleware (session cookie `HttpOnly; Secure; SameSite=Lax`, JWT ลายเซ็นด้วย `jose`, อายุ 30 วัน) และ **ทุก query ต้องกรองด้วย `user_id` เสมอ**

```
GET    /api/tasks?from&to&status&category&q&tag      # ช่วงเวลา สำหรับ FullCalendar
POST   /api/tasks
GET    /api/tasks/:id
PATCH  /api/tasks/:id
DELETE /api/tasks/:id
POST   /api/tasks/:id/complete        POST /api/tasks/:id/snooze
GET    /api/inbox
GET    /api/today                      # รวม today + due today + overdue
GET    /api/categories  | POST | PATCH | DELETE
POST   /api/tasks/:id/attachments      # multipart
GET    /api/attachments/:id            # stream จาก R2 (ตรวจสิทธิ์)
DELETE /api/attachments/:id
GET    /api/settings    | PATCH
POST   /api/line/link-code
POST   /api/focus-sessions | GET /api/stats/weekly | GET /api/stats/overview
GET    /api/export?format=json|csv|ics
GET    /auth/google/login | /auth/google/callback | POST /auth/logout
POST   /webhook/line
```

- Validate input ด้วย **zod** ทุก endpoint
- Error format เดียวกัน `{ error: { code, message } }`
- Recurring: เก็บ rule ที่ task แม่ แล้ว **expand เป็น instance ตอน query ช่วงเวลา** และสร้างแถวจริงเมื่อมีการแก้ไข/ทำเสร็จ instance นั้น

---

## 11. ฟีเจอร์ช่วยบริหารเวลาเพิ่มเติม (ลำดับความสำคัญ)

**ต้องมี (MVP+):** Eisenhower Matrix, Inbox, Recurring tasks, Subtasks, Snooze, Weekly Review, Focus Timer
**ควรมี:** Smart suggestion "งานที่ควรทำก่อน" (คะแนน = urgency×2 + importance×2 + ความใกล้เดดไลน์), เตือนเมื่อวันนี้งานเกินเวลาที่มี (sum estimate > ชั่วโมงทำงาน), Time blocking (ลากงานจาก Inbox ลงช่องเวลา), Templates งาน, ค้นหา/ตัวกรองที่บันทึกได้, Streak/Habit
**ทางเลือก:** Natural language ผ่าน Workers AI, ส่งออก ICS feed แบบ subscribe, Keyboard shortcuts (`n` สร้างงาน, `t` วันนี้, `/` ค้นหา)

---

## 12. แผนการพัฒนา (ทำตามลำดับ — แต่ละ Phase ต้อง commit แยก)

### Phase 0 — Scaffold
- สร้าง monorepo, TypeScript strict, ESLint + Prettier, Vitest
- `wrangler.toml` (D1, R2, cron, assets), Vite proxy สำหรับ dev, scripts: `dev`, `build`, `deploy`, `db:generate`, `db:migrate:local`, `db:migrate:remote`, `test`
- สร้าง `.dev.vars.example` และ `docs/SETUP.md` (ขั้นตอนสร้าง D1/R2, ตั้ง secrets, LINE, Google)
- **AC:** `npm run dev` เปิดหน้าเว็บเปล่า + `/api/health` ตอบ 200

### Phase 1 — Core Web (ไม่มี integration)
- Schema + migrations, CRUD tasks/categories, auth (Google login), Calendar UI (วัน/สัปดาห์/เดือน/list), ฟอร์มงาน, ระบบสี + legend + toggle โหมดสี, panel "วันนี้"
- **AC:** สร้าง/แก้/ลบ/ลากย้ายงานได้, สีถูกต้องตามประเภท/ความเร่งด่วน/ความสำคัญ, refresh แล้วข้อมูลยังอยู่, ใช้งานบนมือถือได้

### Phase 2 — Attachments
- อัปโหลด/ดาวน์โหลด/ลบไฟล์ผ่าน R2 พร้อมตรวจ mime/size/quota/สิทธิ์
- **AC:** แนบไฟล์หลายไฟล์ได้, ผู้ใช้อื่นเข้าถึงไม่ได้ (มี test), ลบงานแล้วลบไฟล์ใน R2 ด้วย

### Phase 3 — LINE OA
- Webhook + verify signature, link code, parser + unit tests, คำสั่งในตาราง 6.4, Flex Message builder, postback (เสร็จ/เลื่อน/ลบ), รับรูป/ไฟล์ → R2, Rich Menu script
- **AC:** พิมพ์ `ส่งรายงาน พรุ่งนี้ 14:00 #งาน !ด่วน` แล้วงานขึ้นในเว็บถูกต้อง, signature ผิดต้องได้ 401, event ซ้ำไม่สร้างงานซ้ำ, parser test ผ่านทั้งหมด

### Phase 4 — Google Calendar Sync
- OAuth connect, เข้ารหัส token, sync create/update/delete/complete, จัดการ token หมดอายุ, ปุ่ม "Sync ทั้งหมดใหม่"
- **AC:** งานที่สร้างจากเว็บและจาก LINE ขึ้นใน Google Calendar ถูกวัน/เวลา/เขตเวลา, แก้/ลบแล้วสะท้อน, ถอด connection แล้วไม่ error

### Phase 5 — Notifications (Cron)
- Morning digest, reminder ก่อนเวลา, deadline วันนี้, evening review, quiet hours, ตัวนับโควตา push, `notification_log`, หน้า Settings ตั้งเวลา
- **AC:** (ทดสอบด้วย `wrangler dev --test-scheduled`) ส่ง digest รอบเดียวต่อวัน ไม่ส่งซ้ำ ไม่ส่งช่วง quiet hours ไม่ส่งถ้าวันนั้นไม่มีงาน และหยุดเมื่อถึง limit

### Phase 6 — Productivity features
- Inbox, Eisenhower Matrix, Recurring, Subtasks, Focus Timer, Weekly Review, Stats, Export
- **AC:** แต่ละหน้าใช้งานได้จริงบนมือถือ และมี test สำหรับ recurrence expansion

### Phase 7 — Polish & Deploy
- PWA, dark mode, a11y, loading/empty/error states, rate limiting พื้นฐาน, ตรวจ security checklist (หัวข้อ 14), deploy จริงด้วย `wrangler deploy`, ทำ `README.md`
- **AC:** Lighthouse mobile ≥ 90 (Performance/Accessibility), deploy สำเร็จบน Cloudflare ด้วย free plan

---

## 13. Environment & Secrets

ตั้งผ่าน `wrangler secret put <NAME>` (production) และ `.dev.vars` (local, **ห้าม commit**)

```
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://<domain>/auth/google/callback
SESSION_SECRET=          # random 32+ bytes
TOKEN_ENC_KEY=           # random 32 bytes base64 (AES-GCM)
APP_BASE_URL=https://<domain>
ALLOWED_EMAILS=          # คั่นด้วย comma — จำกัดผู้ใช้ที่ login ได้ (สำคัญถ้าใช้ส่วนตัว)
PUSH_MONTHLY_LIMIT=      # ตั้งตามโควตา LINE OA ของคุณ
MAX_UPLOAD_MB=10
USER_STORAGE_QUOTA_MB=500
```

---

## 14. Security Checklist (ต้องผ่านก่อน deploy)

- [ ] Verify LINE signature ทุก request, ใช้ constant-time compare
- [ ] Token Google เข้ารหัส AES-GCM, ไม่ log secrets/token/ข้อความผู้ใช้เต็ม ๆ
- [ ] ทุก query กรอง `user_id`; มี test ว่า user A เข้าถึง task/attachment ของ user B ไม่ได้
- [ ] `ALLOWED_EMAILS` จำกัดผู้ที่ login ได้
- [ ] Validate input ด้วย zod, จำกัดขนาด body, whitelist mime ไฟล์
- [ ] Cookie `HttpOnly; Secure; SameSite=Lax`, ป้องกัน CSRF สำหรับ mutation (SameSite + ตรวจ Origin header)
- [ ] ตั้ง security headers (CSP, X-Content-Type-Options, Referrer-Policy)
- [ ] Download ไฟล์ส่ง `Content-Disposition` + `X-Content-Type-Options: nosniff`
- [ ] Rate limit endpoint login และ webhook แบบเบา ๆ
- [ ] ไม่มี secrets ใน repo (`.gitignore` ครอบ `.dev.vars`, `.env*`)

---

## 15. Conventions สำหรับ Claude Code

- TypeScript strict, ไม่ใช้ `any` โดยไม่จำเป็น, ฟังก์ชันเวลาทั้งหมดผ่าน `src/lib/time.ts` (ห้ามเรียก `new Date()` กระจายทั่วโค้ด เพื่อให้ test freeze เวลาได้)
- ใช้ `Intl`/`Temporal`-style helper ที่คำนวณเขตเวลา Asia/Bangkok ได้ถูกต้อง (Workers ไม่มี local tz ให้พึ่ง)
- Commit message แบบ Conventional Commits, หนึ่ง Phase ต่อหลาย commit ที่สมเหตุสมผล
- เขียน test คู่กับ logic ที่เสี่ยง: parser, recurrence, reminder selection, signature verify, authorization
- UI ข้อความภาษาไทยทั้งหมดรวมไว้ที่ `apps/web/src/lib/i18n.ts` (เผื่อทำหลายภาษาภายหลัง)
- ก่อนจบแต่ละ Phase: รัน `npm run lint && npm run test && npm run build` ต้องผ่านทั้งหมด แล้วสรุปสิ่งที่ทำ + สิ่งที่ผู้ใช้ต้องตั้งค่าเอง (เช่นสร้าง LINE channel, Google OAuth client) อย่างสั้น
- **เมื่อพบสิ่งที่ spec ไม่ได้ระบุหรือขัดกัน ให้เลือกค่าเริ่มต้นที่สมเหตุสมผล บันทึกไว้ใน `docs/DECISIONS.md` แล้วทำต่อ** อย่าหยุดถามถ้าไม่จำเป็น ยกเว้นเรื่องที่ย้อนกลับไม่ได้ (ลบข้อมูล production, เปลี่ยน schema ที่มีข้อมูลจริง)
- ห้ามเพิ่ม dependency หนักโดยไม่จำเป็น (ต้องรันบน Workers: ไม่ใช้ Node-only API เช่น `fs`, `crypto` ของ Node — ใช้ Web Crypto)

---

## 16. Definition of Done (ภาพรวม)

ผู้ใช้สามารถ:
1. เปิดเว็บบนมือถือ/คอม เห็นปฏิทินงานวันนี้-สัปดาห์นี้ แยกสีตามประเภท/ความเร่งด่วน/ความสำคัญ และแนบไฟล์ได้
2. พิมพ์ข้อความใน LINE OA แล้วงานเข้าระบบและขึ้น Google Calendar
3. ได้รับสรุปงานตอนเช้า, เตือนก่อนถึงเวลา, เตือนเดดไลน์วันนี้ ผ่าน LINE โดยไม่เกินโควตา push ฟรี
4. ทั้งระบบทำงานบน Cloudflare free tier โดยไม่มีค่าใช้จ่าย

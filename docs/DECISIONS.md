# Decisions

บันทึกการตัดสินใจเมื่อ spec ไม่ได้ระบุหรือขัดกัน

| #   | เรื่อง                      | การตัดสินใจ                                                                  | เหตุผล                                                      |
| --- | --------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | ชื่อโปรเจกต์                | **Dobby** (spec เดิมใช้ชื่อ TimeFlow)                                        | ผู้ใช้กำหนด                                                 |
| 2   | Cron                        | ใช้ `*/5 * * * *` ตัวเดียว (ตามข้อแนะนำหัวข้อ 8) และเช็คเวลา digest ในโค้ด   | ตั้งเวลาละเอียดได้โดยไม่แก้ cron, ไม่ซ้ำซ้อนกับ `0 * * * *` |
| 3   | `@cloudflare/workers-types` | ใช้ v5                                                                       | wrangler 4.157 กำหนด peer `^5`                              |
| 4   | Vite                        | ใช้ v7 ทั้ง root และ web                                                     | vitest ดึง vite 7 อยู่แล้ว กันสองสำเนาที่ type ชนกัน        |
| 5   | Tailwind                    | v3 (PostCSS)                                                                 | เสถียร, config ตรงไปตรงมา                                   |
| 6   | Routing assets              | `run_worker_first` เฉพาะ `/api/*`, `/auth/*`, `/webhook/*`; ที่เหลือเป็น SPA | ให้ asset ฟรีไม่นับ request ของ Worker                      |
| 7   | Timezone                    | คำนวณด้วย offset คงที่ +7 ใน `src/lib/time.ts`                               | ไทยไม่มี DST, ไม่พึ่ง tz ของ runtime                        |

## Phase 1

| #   | เรื่อง                  | การตัดสินใจ                                                                                                        | เหตุผล                                                                                             |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 8   | งาน all-day             | เก็บวันที่ใน `due_date` (วันเดียว) และล้าง `start_at/end_at/due_at`; งานมีเวลาล้าง `due_date`                      | spec ไม่ระบุ field วันเริ่มของ all-day; ทำให้ข้อมูลสอดคล้องกัน (`normalizeTime`)                   |
| 9   | งานที่มีแต่ `due_at`    | แสดงบนปฏิทินเป็นบล็อก ⏰ 30 นาทีที่จบตรงเดดไลน์ ลากเลื่อนได้ แต่ปรับความยาวไม่ได้                                  | เห็นเดดไลน์บนปฏิทินโดยไม่ต้องมี start                                                              |
| 10  | งานที่ไม่มีวัน/เวลาเลย  | ไม่แสดงบนปฏิทิน (เป็นของ Inbox ใน Phase 6); `/api/inbox` พร้อมใช้แล้ว                                              | ตาม spec 5.5                                                                                       |
| 11  | งานของผู้ใช้อื่น        | ตอบ **404** (ไม่ใช่ 403)                                                                                           | ไม่เปิดเผยว่า id นั้นมีอยู่                                                                        |
| 12  | Login Google            | ใช้ `userinfo` endpoint ด้วย access token แทนการ decode id_token; ต้อง `email_verified` และอยู่ใน `ALLOWED_EMAILS` | ไม่ต้องตรวจลายเซ็น JWT เอง; `ALLOWED_EMAILS` ว่าง = ไม่อนุญาตใคร (fail closed)                     |
| 13  | `/auth/dev-login`       | เปิดเฉพาะเมื่อ `DEV_LOGIN=1` (ใน `.dev.vars`) **ห้ามตั้งใน production**                                            | ใช้ทดสอบ local/e2e โดยไม่ต้องมี Google OAuth client                                                |
| 14  | Cookie `Secure`         | ตั้งเมื่อ `APP_BASE_URL` เป็น https เท่านั้น                                                                       | local dev เป็น http                                                                                |
| 15  | FullCalendar timezone   | ตั้ง `timeZone="UTC"` แล้วป้อน "เวลาบนผนังไทย" (ISO+7h) เอง (`apps/web/src/lib/time.ts`)                           | ไม่ต้องใช้ tz plugin และแสดงเวลาไทยเสมอแม้เครื่องผู้ใช้อยู่เขตเวลาอื่น (e2e ทดสอบด้วย tz New York) |
| 16  | Mini calendar           | Phase 1 ใช้ช่อง "ไปยังวันที่" (date picker) แทน mini calendar เต็มรูปแบบ                                           | ไม่กระทบ AC; เก็บไว้ทำใน Polish                                                                    |
| 17  | Legend ปรับสี           | แก้สีประเภทได้ใน Legend ด้วย color picker (บันทึกเมื่อปิด picker)                                                  | ตรงข้อ 5.2; หน้าจัดการประเภทเต็มรูปแบบอยู่ใน Settings                                              |
| 18  | Test DB                 | test ใช้ D1 shim บน `node:sqlite` + migration จริง                                                                 | ไม่ต้องพึ่ง workerd pool; ครอบคลุม SQL จริง                                                        |
| 19  | เลื่อนไปทำใน Phase หลัง | แนบไฟล์ (2), recurrence/subtask (6), reminder + สวิตช์ Google Calendar (4/5), markdown preview ของรายละเอียด       | ตามลำดับ Phase                                                                                     |

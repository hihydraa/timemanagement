# Dobby

ระบบจัดการเวลาส่วนตัว: Web App (ปฏิทิน, PWA) + LINE OA + Google Calendar sync + แจ้งเตือนผ่าน LINE
รันบน Cloudflare Free Tier (Workers + D1 + R2 + Cron). Spec ดู [CLAUDE.md](CLAUDE.md)

## ฟีเจอร์

- ปฏิทิน วัน/สัปดาห์/เดือน/รายการ ลากย้าย แยกสีตามประเภท/ความเร่งด่วน/ความสำคัญ, Dark mode
- ไฟล์แนบ (R2), Inbox, Eisenhower Matrix, งานทำซ้ำ, Subtasks, Focus Timer, Weekly Review, Stats, Export (JSON/CSV/ICS)
- LINE OA: พิมพ์ข้อความภาษาไทยเพื่อสร้าง/ดู/เสร็จ/เลื่อน/ลบงาน, Rich Menu
- Google Calendar sync (App → Google), แจ้งเตือนเช้า/ก่อนเวลา/เดดไลน์/สรุปเย็นแบบ Digest ภายใต้โควตา push
- PWA ติดตั้งได้ อ่านออฟไลน์ได้

## เริ่มใช้

```bash
npm install
npm run dev          # เว็บ :5173 + API :8787
npm run lint && npm test && npm run build
```

## Deploy

ทำตาม [docs/SETUP.md](docs/SETUP.md) (สร้าง D1/R2, ตั้ง secrets, LINE, Google) แล้ว

```bash
npm run db:migrate:remote
npm run deploy       # ตรวจค่าก่อน (scripts/predeploy-check.mjs) → build → wrangler deploy
```

เอกสาร: [SETUP](docs/SETUP.md) · [BRAND](docs/BRAND.md) · [DECISIONS](docs/DECISIONS.md) · [SECURITY](docs/SECURITY.md)
สถานะ: Phase 0–7 เสร็จ (Lighthouse mobile หน้าปฏิทิน: Performance 93, Accessibility 100 บน wrangler dev)

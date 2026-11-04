# Dobby

ระบบจัดการเวลาส่วนตัว: Web App (ปฏิทิน) + LINE OA + Google Calendar sync + แจ้งเตือนผ่าน LINE
รันบน Cloudflare Free Tier (Workers + D1 + R2). Spec ทั้งหมดดูที่ [CLAUDE.md](CLAUDE.md), การติดตั้งดู [docs/SETUP.md](docs/SETUP.md)

```bash
npm install
npm run dev          # เว็บ :5173 + API :8787
npm run lint && npm run test && npm run build
```

สถานะ: Phase 0 (Scaffold), Phase 1 (Core Web) และ Phase 2 (Attachments) เสร็จแล้ว

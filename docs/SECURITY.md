# Security checklist (spec หัวข้อ 14)

| ข้อ                                                                       | สถานะ | หลักฐาน                                                                                              |
| ------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| Verify LINE signature ทุก request, constant-time                          | ✅    | `src/services/line.ts`, `tests/line.test.ts` (signature ผิด = 401)                                   |
| Token Google เข้ารหัส AES-GCM (ผูก userId เป็น AAD), ไม่ log secrets      | ✅    | `src/lib/crypto.ts`, `tests/crypto.test.ts`                                                          |
| ทุก query กรอง `user_id`; user A เข้าถึงของ B ไม่ได้                      | ✅    | `tests/isolation.test.ts` ยิงทุก route ด้วย id ทุกชนิดของ A ในฐานะ B, ตรวจไม่มีข้อมูลหลุด/ไม่เปลี่ยน |
| ทุก `/api/*` (ยกเว้น health, session) ต้องล็อกอิน                         | ✅    | `tests/isolation.test.ts` (ไม่มี cookie = 401)                                                       |
| `ALLOWED_EMAILS` จำกัดผู้ login (fail closed)                             | ✅    | `src/routes/auth.ts`, `tests/auth.test.ts`                                                           |
| Validate ด้วย zod, จำกัดขนาด body, whitelist mime                         | ✅    | `src/app.ts` (bodyLimit 256 KB), `src/services/attachments.ts`                                       |
| Cookie `HttpOnly; Secure; SameSite=Lax` + ตรวจ Origin กัน CSRF            | ✅    | `src/lib/session.ts`, `tests/hardening.test.ts`                                                      |
| Security headers (CSP, nosniff, Referrer-Policy, XFO, Permissions-Policy) | ✅    | `src/app.ts` + `apps/web/public/_headers`, `tests/headers.test.ts`                                   |
| ดาวน์โหลดไฟล์ส่ง `Content-Disposition` + `nosniff`                        | ✅    | `tests/attachments.test.ts`                                                                          |
| Rate limit login และ webhook                                              | ✅    | `src/lib/rateLimit.ts`, `tests/hardening.test.ts`                                                    |
| ไม่มี secrets ใน repo                                                     | ✅    | `.gitignore` ครอบ `.dev.vars`, `.env*`; CI ไม่ใช้ secrets                                            |
| SESSION_SECRET ≥ 32 ตัวอักษร                                              | ✅    | `src/lib/session.ts`                                                                                 |
| Logout ล้าง cache ออฟไลน์ของ service worker                               | ✅    | `apps/web/src/lib/api.ts`, `apps/web/public/sw.js`                                                   |

ข้อจำกัดที่ควรรู้: rate limit นับด้วย D1 (ไม่ใช่ตัวป้องกัน DDoS — ใช้ Cloudflare WAF/Rate Limiting rules ของโดเมนเพิ่มได้); ต้องตรวจ Lighthouse บนโดเมนจริงหลัง deploy

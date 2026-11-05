# METRICS — ดูผลการใช้งานโดยไม่เก็บเนื้อหา

ตาราง `usage_events(id, user_id, name, props_json, created_at)` เก็บ **เฉพาะชื่อเหตุการณ์ + ตัวเลข/หมวดสั้น ๆ** (`a-z0-9_` ≤ 24 ตัว)
ห้ามเก็บชื่องาน รายละเอียด ข้อความ LINE ผู้ใช้ปิดการเก็บได้ที่ "ฉัน → ตั้งค่า → ความเป็นส่วนตัว" (ปิดแล้วลบของเดิมด้วย) และลบเมื่อลบบัญชี

| เหตุการณ์ | เกิดเมื่อ | props |
|---|---|---|
| `signup` | สมัครครั้งแรก (ครั้งเดียว) | – |
| `first_task_created` | งานแรก (ครั้งเดียว) | `seconds_since_signup`, `source` |
| `task_created` | สร้างงาน | `source` = `web_quick` / `web_form` / `line` |
| `task_completed` | เปลี่ยนเป็นเสร็จ | – |
| `morning_plan_opened` | เปิดหน้า "วันนี้" (วันละครั้ง) | – |
| `auto_plan_previewed/applied/undone` | (Step 5) | – |
| `gcal_connected` | เชื่อม Google (ครั้งเดียว) | – |
| `ui_mode_changed` | สลับโหมด | `to` = `simple` / `full` |

รันกับ D1: `npx wrangler d1 execute dobby --remote --command "<SQL>"`

```sql
-- เวลาถึงงานแรก (วินาที) — ค่ากลางโดยประมาณ
SELECT json_extract(props_json,'$.seconds_since_signup') AS secs
FROM usage_events WHERE name='first_task_created' ORDER BY secs;

-- งานที่สร้างต่อวันที่ใช้งาน
SELECT COUNT(*) * 1.0 / COUNT(DISTINCT user_id || substr(created_at,1,10)) AS tasks_per_active_day
FROM usage_events WHERE name='task_created';

-- สัดส่วนช่องทางเพิ่มงาน
SELECT json_extract(props_json,'$.source') AS source, COUNT(*) AS n
FROM usage_events WHERE name='task_created' GROUP BY 1;

-- อัตรา apply แผน (Step 5)
SELECT SUM(name='auto_plan_applied') * 1.0 / NULLIF(SUM(name='auto_plan_previewed'),0) AS apply_rate
FROM usage_events WHERE name IN ('auto_plan_previewed','auto_plan_applied');

-- กลับมาใช้วันที่ 1 / 7 / 30 หลังสมัคร (นับว่ามีเหตุการณ์ใด ๆ ในวันนั้น)
WITH s AS (SELECT user_id, date(created_at) d0 FROM usage_events WHERE name='signup')
SELECT n AS day_n,
       COUNT(DISTINCT s.user_id) AS signed_up,
       COUNT(DISTINCT CASE WHEN date(e.created_at) = date(s.d0, '+' || n || ' day') THEN s.user_id END) AS returned
FROM s CROSS JOIN (SELECT 1 AS n UNION SELECT 7 UNION SELECT 30)
LEFT JOIN usage_events e ON e.user_id = s.user_id
GROUP BY n;
```

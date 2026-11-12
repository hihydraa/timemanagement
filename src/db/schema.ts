import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull().default(''),
  googleSub: text('google_sub').unique(),
  lineUserId: text('line_user_id').unique(),
  timezone: text('timezone').notNull().default('Asia/Bangkok'),
  createdAt: text('created_at').notNull(),
});

export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id').primaryKey(),
  morningDigestTime: text('morning_digest_time').notNull().default('07:30'),
  eveningReviewTime: text('evening_review_time').notNull().default('20:00'),
  remindBeforeMinutes: integer('remind_before_minutes').notNull().default(30),
  quietHoursStart: text('quiet_hours_start').notNull().default('22:00'),
  quietHoursEnd: text('quiet_hours_end').notNull().default('06:30'),
  lineNotifyEnabled: integer('line_notify_enabled').notNull().default(1),
  gcalSyncEnabled: integer('gcal_sync_enabled').notNull().default(0),
  gcalCalendarId: text('gcal_calendar_id').notNull().default('primary'),
  /** เวลาเตือนเดดไลน์วันนี้ (บ่าย) */
  deadlineAlertTime: text('deadline_alert_time').notNull().default('15:00'),
  eveningReviewEnabled: integer('evening_review_enabled').notNull().default(1),
  /** ส่วนที่แสดงในแถบด้านข้างของปฏิทิน (JSON array ของชื่อส่วน; null = ค่าเริ่มต้น) */
  sidebarSections: text('sidebar_sections'),
  /** ชั่วโมงทำงานต่อวัน (ใช้คำนวณภาระงาน): HH:mm เวลาไทย */
  workStart: text('work_start').notNull().default('09:00'),
  workEnd: text('work_end').notNull().default('18:00'),
  /** วันทำงาน: เลขวัน ISO 1=จันทร์ … 7=อาทิตย์ คั่นด้วย comma */
  workDays: text('work_days').notNull().default('1,2,3,4,5'),
  /** โหมดหน้าจอ: 'simple' (ค่าเริ่มต้นของผู้ใช้ใหม่) | 'full' */
  uiMode: text('ui_mode').notNull().default('simple'),
  /** 1 = ไม่ให้เก็บสถิติการใช้งานเลย */
  analyticsOptOut: integer('analytics_opt_out').notNull().default(0),
  /** ทำ/ข้าม onboarding แล้วเมื่อไร (null = ยังไม่เคย) */
  onboardingDoneAt: text('onboarding_done_at'),
});

/** เหตุการณ์ใช้งานแบบไม่ระบุเนื้อหา: เก็บเฉพาะชื่อเหตุการณ์ + ค่าตัวเลข/หมวดสั้น ๆ (ห้ามมีชื่องาน/ข้อความ) */
export const usageEvents = sqliteTable(
  'usage_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    propsJson: text('props_json').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('usage_events_user_name_idx').on(t.userId, t.name, t.createdAt)],
);

export const googleTokens = sqliteTable('google_tokens', {
  userId: text('user_id').primaryKey(),
  refreshTokenEnc: text('refresh_token_enc'),
  accessTokenEnc: text('access_token_enc'),
  expiresAt: text('expires_at'),
  scope: text('scope'),
  /** บัญชี Google ที่เชื่อมปฏิทิน */
  email: text('email'),
});

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    icon: text('icon'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('categories_user_idx').on(t.userId)],
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    categoryId: text('category_id'),
    urgency: integer('urgency').notNull().default(2),
    importance: integer('importance').notNull().default(2),
    status: text('status', { enum: ['todo', 'doing', 'done', 'cancelled'] })
      .notNull()
      .default('todo'),
    allDay: integer('all_day').notNull().default(0),
    startAt: text('start_at'),
    endAt: text('end_at'),
    dueAt: text('due_at'),
    dueDate: text('due_date'),
    estimateMinutes: integer('estimate_minutes'),
    recurrenceRule: text('recurrence_rule'),
    parentTaskId: text('parent_task_id'),
    /** แถวจริงของ "ครั้งที่" (YYYY-MM-DD) ในซีรีส์ที่ parent_task_id ชี้ไป (ใช้ซ่อน instance เสมือนของวันนั้น) */
    recurrenceId: text('recurrence_id'),
    gcalEventId: text('gcal_event_id'),
    gcalSyncedAt: text('gcal_synced_at'),
    /** ผู้ใช้เปิด/ปิดการซิงก์งานนี้ไป Google Calendar (ผลจริงต้องเปิด gcal_sync_enabled ด้วย) */
    gcalSync: integer('gcal_sync').notNull().default(1),
    source: text('source', { enum: ['web', 'line'] })
      .notNull()
      .default('web'),
    /** จำนวนครั้งที่ถูกเลื่อน (ใช้ลดคะแนนแนะนำ ไม่ให้งานเดิมถูกดันไปเรื่อย ๆ) */
    snoozeCount: integer('snooze_count').notNull().default(0),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('tasks_user_due_idx').on(t.userId, t.dueAt),
    index('tasks_user_start_idx').on(t.userId, t.startAt),
    index('tasks_user_status_idx').on(t.userId, t.status),
    // ซีรีส์หนึ่งมีแถวจริงของแต่ละครั้งได้ไม่เกินหนึ่งแถว (NULL ไม่ชนกันใน SQLite)
    uniqueIndex('tasks_series_occurrence_idx').on(t.parentTaskId, t.recurrenceId),
  ],
);

export const taskTags = sqliteTable(
  'task_tags',
  { taskId: text('task_id').notNull(), tag: text('tag').notNull() },
  (t) => [primaryKey({ columns: [t.taskId, t.tag] })],
);

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(),
  userId: text('user_id').notNull(),
  r2Key: text('r2_key').notNull(),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  createdAt: text('created_at').notNull(),
});

export const reminders = sqliteTable(
  'reminders',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull(),
    remindAt: text('remind_at').notNull(),
    sentAt: text('sent_at'),
    kind: text('kind', { enum: ['before', 'due', 'overdue', 'web_before'] }).notNull(),
  },
  (t) => [index('reminders_sent_remind_idx').on(t.sentAt, t.remindAt)],
);

export const notificationLog = sqliteTable('notification_log', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  channel: text('channel').notNull().default('line_push'),
  kind: text('kind').notNull(),
  sentAt: text('sent_at').notNull(),
  ok: integer('ok').notNull(),
  detail: text('detail'),
});

export const lineLinkCodes = sqliteTable('line_link_codes', {
  code: text('code').primaryKey(),
  userId: text('user_id').notNull(),
  expiresAt: text('expires_at').notNull(),
});

export const focusSessions = sqliteTable('focus_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  taskId: text('task_id'),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  minutes: integer('minutes').notNull().default(0),
});

/** กัน webhook event ซ้ำด้วย webhookEventId */
export const lineEvents = sqliteTable('line_events', {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
});

/** state ต่อ LINE user: รายการล่าสุดที่แสดง (สำหรับ "เสร็จ 2"), ไฟล์ที่รอเลือกงาน, ตัวนับรหัสผูกบัญชีที่ผิด */
export const lineState = sqliteTable('line_state', {
  lineUserId: text('line_user_id').primaryKey(),
  listJson: text('list_json'),
  listAt: text('list_at'),
  pendingMedia: text('pending_media'),
  failCount: integer('fail_count').notNull().default(0),
  failWindowAt: text('fail_window_at'),
});

/** checklist ย่อยของงาน (แยกตารางเพื่อไม่ให้ปนกับ Inbox/ปฏิทิน/แจ้งเตือน) */
export const subtasks = sqliteTable(
  'subtasks',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').notNull(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    done: integer('done').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('subtasks_task_idx').on(t.taskId)],
);

/** ตัวนับ rate limit แบบ fixed window (key = scope:ผู้เรียก:เริ่มหน้าต่าง) */
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  expiresAt: text('expires_at').notNull(),
});

/** อุปกรณ์/เบราว์เซอร์ที่สมัครรับแจ้งเตือนในเว็บ (Web Push) */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('push_subscriptions_endpoint_idx').on(t.endpoint),
    index('push_subscriptions_user_idx').on(t.userId),
  ],
);

/** นาฬิกาปลุก: ส่ง Web Push เร่งด่วนตรงเวลา (เช็คทุกนาที) ซ้ำจนกดหยุด/เลื่อน */
export const alarms = sqliteTable(
  'alarms',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    label: text('label').notNull().default(''),
    /** HH:mm เวลาไทย */
    time: text('time').notNull(),
    /** วันที่ปลุก: เลข ISO 1=จันทร์…7=อาทิตย์ คั่นด้วย comma ('' + once_date = ครั้งเดียว) */
    days: text('days').notNull().default(''),
    onceDate: text('once_date'),
    enabled: integer('enabled').notNull().default(1),
    lastFiredDate: text('last_fired_date'),
    /** จำนวนครั้งที่ดังไปแล้วในรอบนี้ (0 = เงียบ) และเวลาที่จะดังซ้ำ */
    ringCount: integer('ring_count').notNull().default(0),
    nextRingAt: text('next_ring_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('alarms_user_idx').on(t.userId), index('alarms_time_idx').on(t.enabled, t.time)],
);

/** เกมสะสม: ตัวละครของผู้ใช้ + ชื่อที่ Dobby ใช้เรียก */
export const gameProfiles = sqliteTable('game_profiles', {
  userId: text('user_id').primaryKey(),
  characterId: text('character_id').notNull(),
  displayName: text('display_name').notNull().default(''),
  honorific: text('honorific', { enum: ['name', 'master', 'both'] })
    .notNull()
    .default('name'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** บัญชีแต้ม (บวก = ได้, ลบ = ซื้อ): ยอดคงเหลือ = ผลรวม; unique (user, kind, ref) กันได้แต้ม/ซื้อซ้ำ */
export const gameLedger = sqliteTable(
  'game_ledger',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    kind: text('kind', { enum: ['welcome', 'create', 'complete', 'daily', 'buy'] }).notNull(),
    ref: text('ref').notNull(),
    points: integer('points').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('game_ledger_ref_idx').on(t.userId, t.kind, t.ref),
    index('game_ledger_user_idx').on(t.userId, t.createdAt),
  ],
);

export const gameInventory = sqliteTable(
  'game_inventory',
  {
    userId: text('user_id').notNull(),
    itemId: text('item_id').notNull(),
    equipped: integer('equipped').notNull().default(0),
    acquiredAt: text('acquired_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);

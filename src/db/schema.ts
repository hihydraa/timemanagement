import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
});

export const googleTokens = sqliteTable('google_tokens', {
  userId: text('user_id').primaryKey(),
  refreshTokenEnc: text('refresh_token_enc'),
  accessTokenEnc: text('access_token_enc'),
  expiresAt: text('expires_at'),
  scope: text('scope'),
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
    gcalEventId: text('gcal_event_id'),
    gcalSyncedAt: text('gcal_synced_at'),
    source: text('source', { enum: ['web', 'line'] })
      .notNull()
      .default('web'),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('tasks_user_due_idx').on(t.userId, t.dueAt),
    index('tasks_user_start_idx').on(t.userId, t.startAt),
    index('tasks_user_status_idx').on(t.userId, t.status),
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
    kind: text('kind', { enum: ['before', 'due', 'overdue'] }).notNull(),
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

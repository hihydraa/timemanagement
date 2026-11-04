export type Status = 'todo' | 'doing' | 'done' | 'cancelled';

export interface Task {
  id: string;
  title: string;
  description: string;
  categoryId: string | null;
  urgency: number;
  importance: number;
  status: Status;
  allDay: boolean;
  startAt: string | null;
  endAt: string | null;
  dueAt: string | null;
  dueDate: string | null;
  estimateMinutes: number | null;
  tags: string[];
  attachmentCount: number;
  gcalSync: boolean;
  gcalEventId: string | null;
  gcalSyncedAt: string | null;
  completedAt: string | null;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  sortOrder: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface TodayData {
  date: string;
  overdue: Task[];
  dueToday: Task[];
  today: Task[];
}

export type TaskPayload = Partial<
  Omit<Task, 'id' | 'completedAt' | 'attachmentCount' | 'gcalEventId' | 'gcalSyncedAt'>
>;

export type ColorMode = 'category' | 'urgency' | 'importance';

export interface Attachment {
  id: string;
  taskId: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  createdAt: string;
  isImage: boolean;
}

export interface StorageInfo {
  usedBytes: number;
  quotaBytes: number;
  maxFileBytes: number;
  maxFiles: number;
}

export interface GcalStatus {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  email: string | null;
  syncEnabled: boolean;
  calendarId: string;
}

export interface ResyncResult {
  processed: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  failed: number;
  nextCursor: string | null;
  reasons: string[];
}

export interface NotificationSettings {
  morningDigestTime: string;
  eveningReviewTime: string;
  eveningReviewEnabled: boolean;
  deadlineAlertTime: string;
  remindBeforeMinutes: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  lineNotifyEnabled: boolean;
}

export interface SettingsView {
  settings: NotificationSettings;
  lineLinked: boolean;
}

export interface PushStatus {
  month: string;
  used: number;
  limit: number;
  limitConfigured: boolean;
  blocked: boolean;
  nearLimit: boolean;
  exhausted: boolean;
}

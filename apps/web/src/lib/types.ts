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
  subtaskTotal: number;
  subtaskDone: number;
  parentTaskId: string | null;
  recurrenceId: string | null;
  recurrenceRule: string | null;
  gcalSync: boolean;
  gcalEventId: string | null;
  gcalSyncedAt: string | null;
  completedAt: string | null;
  /** จำนวนครั้งที่ถูกเลื่อน */
  snoozeCount: number;
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
  Omit<
    Task,
    | 'id'
    | 'completedAt'
    | 'attachmentCount'
    | 'gcalEventId'
    | 'gcalSyncedAt'
    | 'subtaskTotal'
    | 'subtaskDone'
    | 'parentTaskId'
    | 'recurrenceId'
  >
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

export type SidebarSection =
  'mini' | 'search' | 'category' | 'urgency' | 'importance' | 'status' | 'tag' | 'legend';

export interface WorkSettings {
  start: string;
  end: string;
  /** ISO 1=จันทร์ … 7=อาทิตย์ */
  days: number[];
}

export interface TrayData {
  /** มีวัน/เดดไลน์ แต่ยังไม่มีเวลาเริ่ม เรียงตามเดดไลน์ */
  dated: Task[];
  /** ยังไม่มีวันเลย */
  inbox: Task[];
}

export interface CockpitData {
  date: string;
  now: string;
  work: WorkSettings;
  overdue: Task[];
  dueToday: Task[];
  today: Task[];
  doneToday: Task[];
  focusMinutes: number;
}

export interface SettingsView {
  settings: NotificationSettings;
  work: WorkSettings;
  sidebarSections: SidebarSection[];
  uiMode: 'simple' | 'full';
  analyticsOptOut: boolean;
  onboardingDone: boolean;
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

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  sortOrder: number;
}

export interface FocusSession {
  id: string;
  taskId: string | null;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
}

export interface BriefTask {
  id: string;
  title: string;
  status: Status;
  categoryId: string | null;
  date: string | null;
  completedAt: string | null;
  urgency: number;
  importance: number;
}

export interface CategoryStat {
  categoryId: string | null;
  name: string;
  color: string;
  focusMinutes: number;
  plannedMinutes?: number;
  completed: number;
}

export interface WeeklyStats {
  weekStart: string;
  weekEnd: string;
  completed: number;
  scheduled: number;
  scheduledDone: number;
  completionRate: number | null;
  overdueOpen: number;
  focusMinutes: number;
  byCategory: CategoryStat[];
  completedTasks: BriefTask[];
  notDoneTasks: BriefTask[];
  nextWeek: { weekStart: string; weekEnd: string; total: number; tasks: BriefTask[] };
}

export interface OverviewStats {
  days: number;
  from: string;
  to: string;
  scheduled: number;
  scheduledDone: number;
  completionRate: number | null;
  completedTotal: number;
  focusMinutes: number;
  daily: { date: string; completed: number; scheduled: number }[];
  byCategory: CategoryStat[];
  streak: { current: number; best: number };
  totals: { open: number; doneThisWeek: number };
}

export interface Alarm {
  id: string;
  label: string;
  time: string;
  days: number[];
  onceDate: string | null;
  enabled: boolean;
  ringing: boolean;
}

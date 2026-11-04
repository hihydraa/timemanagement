import { clearApiCache } from './pwa';
import { t } from './i18n';
import type {
  Attachment,
  Category,
  FocusSession,
  GcalStatus,
  NotificationSettings,
  OverviewStats,
  PushStatus,
  ResyncResult,
  CockpitData,
  SettingsView,
  SidebarSection,
  StorageInfo,
  Subtask,
  Task,
  TaskPayload,
  TodayData,
  User,
  WeeklyStats,
} from './types';

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      // FormData: ปล่อยให้เบราว์เซอร์ตั้ง Content-Type (พร้อม boundary) เอง
      headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError(0, 'offline', t.error.offline); // เครือข่ายล่ม/ออฟไลน์
  }
  if (res.status === 401) void clearApiCache(); // session หมดอายุ: ไม่เก็บข้อมูลส่วนตัวค้างไว้ในเครื่อง
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as {
      error?: { code: string; message: string };
    } | null;
    throw new ApiClientError(
      res.status,
      j?.error?.code ?? 'error',
      j?.error?.message ?? 'เกิดข้อผิดพลาด',
    );
  }
  return (await res.json()) as T;
}

/** แจ้ง UI ว่ามีงานเสร็จ (CelebrateToast ฟัง event นี้) */
function celebrate() {
  try {
    window.dispatchEvent(new Event('dobby:celebrate'));
  } catch {
    /* ไม่มี window (เช่นตอน test) */
  }
}

export const api = {
  me: () => req<{ user: User }>('GET', '/api/me').then((r) => r.user),
  /** ตอบ 200 เสมอ: user = null เมื่อยังไม่ล็อกอิน (ไม่มี 401 ใน console) */
  session: () => req<{ user: User | null }>('GET', '/api/session').then((r) => r.user),
  /** ลบบัญชีและข้อมูลทั้งหมด (ต้องส่งอีเมลของบัญชีเพื่อยืนยัน) */
  deleteAccount: (confirm: string) =>
    req<{ ok: true; deletedFiles: number }>('DELETE', '/api/account', { confirm }).finally(() =>
      clearApiCache(),
    ),
  logout: () => req<{ ok: true }>('POST', '/auth/logout').finally(() => clearApiCache()),
  listTasks: (fromIso: string, toIso: string) =>
    req<{ tasks: Task[] }>(
      'GET',
      `/api/tasks?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
    ).then((r) => r.tasks),
  today: () => req<TodayData>('GET', '/api/today'),
  cockpit: () => req<CockpitData>('GET', '/api/cockpit'),
  rescheduleOverdue: (to: 'today' | 'tomorrow') =>
    req<{ movedIds: string[]; hasMore: boolean }>('POST', '/api/today/reschedule-overdue', { to }),
  snoozeTask: (id: string, body: { minutes?: number; days?: number }) =>
    req<{ task: Task }>('POST', `/api/tasks/${id}/snooze`, body).then((r) => r.task),
  createTask: (p: TaskPayload) => req<{ task: Task }>('POST', '/api/tasks', p).then((r) => r.task),
  updateTask: (id: string, p: TaskPayload) =>
    req<{ task: Task }>('PATCH', `/api/tasks/${id}`, p).then((r) => {
      if (p.status === 'done') celebrate();
      return r.task;
    }),
  deleteTask: (id: string, scope: 'one' | 'series' = 'one') =>
    req<{ ok: true }>('DELETE', `/api/tasks/${id}${scope === 'series' ? '?scope=series' : ''}`),
  materialize: (id: string) =>
    req<{ task: Task }>('POST', `/api/tasks/${id}/materialize`).then((r) => r.task),
  inbox: () => req<{ tasks: Task[] }>('GET', '/api/inbox').then((r) => r.tasks),
  matrix: () => req<{ tasks: Task[] }>('GET', '/api/matrix').then((r) => r.tasks),
  listSubtasks: (taskId: string) =>
    req<{ subtasks: Subtask[]; template: boolean }>('GET', `/api/tasks/${taskId}/subtasks`),
  addSubtask: (taskId: string, title: string) =>
    req<{ subtask: Subtask; taskId: string }>('POST', `/api/tasks/${taskId}/subtasks`, { title }),
  updateSubtask: (id: string, p: { title?: string; done?: boolean }) =>
    req<{ subtask: Subtask }>('PATCH', `/api/subtasks/${id}`, p).then((r) => r.subtask),
  deleteSubtask: (id: string) => req<{ ok: true }>('DELETE', `/api/subtasks/${id}`),
  createFocusSession: (p: {
    taskId: string | null;
    startedAt: string;
    endedAt: string;
    minutes: number;
  }) => req<{ session: FocusSession }>('POST', '/api/focus-sessions', p),
  focusSessions: (date?: string) =>
    req<{ date: string; sessions: FocusSession[]; totalMinutes: number }>(
      'GET',
      `/api/focus-sessions${date ? `?date=${date}` : ''}`,
    ),
  weekly: (week?: string) =>
    req<WeeklyStats>('GET', `/api/stats/weekly${week ? `?week=${week}` : ''}`),
  overview: (days: number) => req<OverviewStats>('GET', `/api/stats/overview?days=${days}`),
  completeTask: (id: string) =>
    req<{ task: Task }>('POST', `/api/tasks/${id}/complete`).then((r) => {
      celebrate();
      return r.task;
    }),
  listCategories: () =>
    req<{ categories: Category[] }>('GET', '/api/categories').then((r) => r.categories),
  updateCategory: (id: string, p: Partial<Pick<Category, 'name' | 'color'>>) =>
    req<{ category: Category }>('PATCH', `/api/categories/${id}`, p).then((r) => r.category),
  getTask: (id: string) => req<{ task: Task }>('GET', `/api/tasks/${id}`).then((r) => r.task),
  lineStatus: () => req<{ linked: boolean }>('GET', '/api/line/status'),
  lineLinkCode: () => req<{ code: string; expiresAt: string }>('POST', '/api/line/link-code'),
  lineUnlink: () => req<{ ok: true }>('DELETE', '/api/line/link'),
  gcalStatus: () => req<GcalStatus>('GET', '/api/gcal/status'),
  gcalSettings: (p: { syncEnabled?: boolean; calendarId?: string }) =>
    req<GcalStatus>('PATCH', '/api/gcal/settings', p),
  gcalDisconnect: () => req<GcalStatus>('POST', '/api/gcal/disconnect', {}),
  gcalResync: (cursor: string | null) => req<ResyncResult>('POST', '/api/gcal/resync', { cursor }),
  getSettings: () => req<SettingsView>('GET', '/api/settings'),
  patchSettings: (
    p: Partial<NotificationSettings> & {
      sidebarSections?: SidebarSection[];
      workStart?: string;
      workEnd?: string;
      workDays?: number[];
    },
  ) => req<SettingsView>('PATCH', '/api/settings', p),
  pushStatus: () => req<PushStatus>('GET', '/api/notifications/status'),
  listAttachments: (taskId: string) =>
    req<{ attachments: Attachment[] }>('GET', `/api/tasks/${taskId}/attachments`).then(
      (r) => r.attachments,
    ),
  uploadAttachments: (taskId: string, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    return req<{ attachments: Attachment[]; taskId: string }>(
      'POST',
      `/api/tasks/${taskId}/attachments`,
      fd,
    );
  },
  deleteAttachment: (id: string) => req<{ ok: true }>('DELETE', `/api/attachments/${id}`),
  storage: () => req<StorageInfo>('GET', '/api/storage'),
};

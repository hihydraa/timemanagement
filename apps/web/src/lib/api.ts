import type {
  Attachment,
  Category,
  StorageInfo,
  Task,
  TaskPayload,
  TodayData,
  User,
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
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    // FormData: ปล่อยให้เบราว์เซอร์ตั้ง Content-Type (พร้อม boundary) เอง
    headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
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

export const api = {
  me: () => req<{ user: User }>('GET', '/api/me').then((r) => r.user),
  logout: () => req<{ ok: true }>('POST', '/auth/logout'),
  listTasks: (fromIso: string, toIso: string) =>
    req<{ tasks: Task[] }>(
      'GET',
      `/api/tasks?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
    ).then((r) => r.tasks),
  today: () => req<TodayData>('GET', '/api/today'),
  createTask: (p: TaskPayload) => req<{ task: Task }>('POST', '/api/tasks', p).then((r) => r.task),
  updateTask: (id: string, p: TaskPayload) =>
    req<{ task: Task }>('PATCH', `/api/tasks/${id}`, p).then((r) => r.task),
  deleteTask: (id: string) => req<{ ok: true }>('DELETE', `/api/tasks/${id}`),
  completeTask: (id: string) =>
    req<{ task: Task }>('POST', `/api/tasks/${id}/complete`).then((r) => r.task),
  listCategories: () =>
    req<{ categories: Category[] }>('GET', '/api/categories').then((r) => r.categories),
  updateCategory: (id: string, p: Partial<Pick<Category, 'name' | 'color'>>) =>
    req<{ category: Category }>('PATCH', `/api/categories/${id}`, p).then((r) => r.category),
  getTask: (id: string) => req<{ task: Task }>('GET', `/api/tasks/${id}`).then((r) => r.task),
  lineStatus: () => req<{ linked: boolean }>('GET', '/api/line/status'),
  lineLinkCode: () => req<{ code: string; expiresAt: string }>('POST', '/api/line/link-code'),
  lineUnlink: () => req<{ ok: true }>('DELETE', '/api/line/link'),
  listAttachments: (taskId: string) =>
    req<{ attachments: Attachment[] }>('GET', `/api/tasks/${taskId}/attachments`).then(
      (r) => r.attachments,
    ),
  uploadAttachments: (taskId: string, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    return req<{ attachments: Attachment[] }>('POST', `/api/tasks/${taskId}/attachments`, fd).then(
      (r) => r.attachments,
    );
  },
  deleteAttachment: (id: string) => req<{ ok: true }>('DELETE', `/api/attachments/${id}`),
  storage: () => req<StorageInfo>('GET', '/api/storage'),
};

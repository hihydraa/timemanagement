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

export type TaskPayload = Partial<Omit<Task, 'id' | 'completedAt'>>;

export type ColorMode = 'category' | 'urgency' | 'importance';

import type { Task } from './types';

/**
 * ตรรกะวางแผนวัน (ฟังก์ชันบริสุทธิ์ ไม่แตะ DOM/เครือข่าย เพื่อทดสอบได้): ภาระงาน, คะแนนงาน, "ทำต่อไป",
 * ข้อความ Insight ของ Dobby และ timeline ของวัน — ตามนิยามใน docs/UX_REVISION.md หัวข้อ 5.1, 5.3, 5.5
 * เวลาทั้งหมดคิดเป็นเวลาไทย (UTC+7) ผ่าน offset คงที่
 */
const OFFSET_MS = 7 * 3_600_000;
const DAY_MIN = 1440;
export const DEFAULT_ESTIMATE = 30;
export const GAP_MIN = 45;

export type PlanTask = Pick<
  Task,
  | 'id'
  | 'title'
  | 'status'
  | 'allDay'
  | 'startAt'
  | 'endAt'
  | 'dueAt'
  | 'dueDate'
  | 'estimateMinutes'
  | 'urgency'
  | 'importance'
  | 'snoozeCount'
>;
export interface WorkHours {
  start: string; // HH:mm
  end: string;
  /** ISO 1=จันทร์ … 7=อาทิตย์ */
  days: number[];
}
export const DEFAULT_WORK: WorkHours = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] };

// ---------------------------------------------------------------- เวลา
export const bkYmd = (iso: string): string =>
  new Date(Date.parse(iso) + OFFSET_MS).toISOString().slice(0, 10);
/** นาทีของวัน (เวลาไทย) 0–1439 */
export const bkMinute = (iso: string): number => {
  const d = new Date(Date.parse(iso) + OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
export const hmToMin = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const minToHm = (min: number): string =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const isoWeekday = (ymd: string): number => {
  const d = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};
const dayDiff = (a: string, b: string): number =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

export function fmtDuration(min: number): string {
  if (min < 30) return `${Math.max(0, Math.round(min))} นาที`;
  const h = Math.round(min / 30) / 2;
  return `${h} ชม.`;
}

// ---------------------------------------------------------------- นัด vs งาน
const isOpen = (t: PlanTask) => t.status === 'todo' || t.status === 'doing';
const isLive = (t: PlanTask) => t.status !== 'cancelled';

/** นัด = เวลาตายตัว (มีทั้งเริ่มและจบที่ต่างกัน) ; งาน = ที่เหลือ (ย้ายได้ มีเวลาประมาณ/เดดไลน์) */
export const isAppointment = (t: PlanTask): boolean =>
  !t.allDay && !!t.startAt && !!t.endAt && t.endAt > t.startAt;

type Interval = [number, number];
function merge(iv: Interval[]): Interval[] {
  const s = iv.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const cur of s) {
    const last = out[out.length - 1];
    if (last && cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else out.push([cur[0], cur[1]]);
  }
  return out;
}

/** ช่วงนาทีของ "นัด" ที่ตกในวัน ymd (ตัดให้อยู่ในวันนั้น) */
export function appointmentIntervals(tasks: PlanTask[], ymd: string): Interval[] {
  const out: Interval[] = [];
  for (const t of tasks) {
    if (!isLive(t) || !isAppointment(t)) continue;
    const sd = bkYmd(t.startAt!);
    const ed = bkYmd(t.endAt!);
    if (ymd < sd || ymd > ed) continue;
    const a = sd === ymd ? bkMinute(t.startAt!) : 0;
    const b = ed === ymd ? bkMinute(t.endAt!) : DAY_MIN;
    out.push([a, b]);
  }
  return merge(out);
}

// ---------------------------------------------------------------- ภาระงาน
export type LoadStatus = 'ok' | 'warn' | 'over' | 'off';
export interface DayLoad {
  workDay: boolean;
  /** นาทีทำงานทั้งหมดในวัน (ไม่หักนัด) */
  workMinutes: number;
  /** นาทีที่ถูกนัดตายตัวกินไป (เฉพาะในชั่วโมงทำงาน) */
  appointmentMinutes: number;
  /** นาทีว่างหลังหักนัด */
  available: number;
  /** ผลรวมเวลาประมาณของงานที่ยังไม่เสร็จ (ไม่มี estimate นับ 30 นาที) */
  planned: number;
  /** planned ÷ available (null = วันหยุด; Infinity = ไม่มีเวลาว่างแต่ยังมีงาน) */
  ratio: number | null;
  status: LoadStatus;
}

export const loadStatus = (ratio: number): Exclude<LoadStatus, 'off'> =>
  ratio <= 0.7 ? 'ok' : ratio <= 1 ? 'warn' : 'over';

export function plannedMinutes(tasks: PlanTask[]): number {
  return tasks
    .filter((t) => isOpen(t) && !isAppointment(t))
    .reduce(
      (n, t) =>
        n + (t.estimateMinutes && t.estimateMinutes > 0 ? t.estimateMinutes : DEFAULT_ESTIMATE),
      0,
    );
}

/**
 * ภาระงานของวัน ymd: available = ชั่วโมงทำงาน − นัดตายตัว, planned = estimate ของงานที่ยังไม่เสร็จ
 * (tasks = งานที่ "กำหนดไว้ในวันนั้น" รวมนัด) วันที่ไม่ใช่วันทำงาน = status 'off' (ไม่ตีเป็นเกินภาระ)
 */
export function dayLoad(ymd: string, work: WorkHours, tasks: PlanTask[]): DayLoad {
  const ws = hmToMin(work.start);
  const we = Math.max(ws, hmToMin(work.end));
  const planned = plannedMinutes(tasks);
  const workDay = work.days.includes(isoWeekday(ymd));
  if (!workDay) {
    return {
      workDay,
      workMinutes: 0,
      appointmentMinutes: 0,
      available: 0,
      planned,
      ratio: null,
      status: 'off',
    };
  }
  const blocked = appointmentIntervals(tasks, ymd).reduce(
    (n, [a, b]) => n + Math.max(0, Math.min(b, we) - Math.max(a, ws)),
    0,
  );
  const available = Math.max(0, we - ws - blocked);
  const ratio = available > 0 ? planned / available : planned > 0 ? Infinity : 0;
  return {
    workDay,
    workMinutes: we - ws,
    appointmentMinutes: blocked,
    available,
    planned,
    ratio,
    status: loadStatus(ratio),
  };
}

// ---------------------------------------------------------------- คะแนนงาน
const deadlineDate = (t: PlanTask): string | null => (t.dueAt ? bkYmd(t.dueAt) : t.dueDate);

export function deadlineBoost(t: PlanTask, today: string): number {
  const d = deadlineDate(t);
  if (!d) return 0;
  const n = dayDiff(d, today);
  return n < 0 ? 8 : n === 0 ? 6 : n === 1 ? 4 : n <= 3 ? 2 : 0;
}

/** score = urgency×2 + importance×2 + deadlineBoost + top3Boost − snoozePenalty (≥ −2) */
export function score(t: PlanTask, ctx: { today: string; top3?: ReadonlySet<string> }): number {
  const penalty = Math.min(2, 0.5 * (t.snoozeCount ?? 0));
  return (
    t.urgency * 2 +
    t.importance * 2 +
    deadlineBoost(t, ctx.today) +
    (ctx.top3?.has(t.id) ? 3 : 0) -
    penalty
  );
}

export type NextReason = 'doing' | 'overdue' | 'due_today' | 'starting' | 'scheduled' | 'anytime';
export interface NextUp {
  task: PlanTask;
  score: number;
  reason: NextReason;
}

const timeKey = (t: PlanTask): string => t.startAt ?? t.dueAt ?? t.dueDate ?? '9999';

/**
 * "ทำต่อไป": งานที่ยังไม่เสร็จที่คะแนนสูงสุด จากกลุ่มที่ลงมือได้ตอนนี้ —
 * (ก) มีเวลาเริ่มใกล้ตอนนี้ (เริ่มแล้ว หรือเริ่มภายใน 60 นาที) หรือ
 * (ข) ไม่มีเวลาเริ่มกำหนดและอยู่ในวันนี้/เลยกำหนด (งานที่เริ่มทีหลังวันนี้/หลัง 60 นาทีไม่นับ)
 */
export function nextUp(
  tasks: PlanTask[],
  now: Date,
  ctx: { today: string; top3?: ReadonlySet<string> },
  horizonMin = 60,
): NextUp | null {
  const nowMs = now.getTime();
  const best = tasks
    .filter(isOpen)
    .filter((t) => {
      if (t.startAt) return Date.parse(t.startAt) <= nowMs + horizonMin * 60_000;
      const d = deadlineDate(t);
      return !!d && d <= ctx.today; // ไม่มีวัน (เช่น Inbox) ไม่ถูกแนะนำที่นี่
    })
    .map((t) => ({ task: t, score: score(t, ctx) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        timeKey(a.task).localeCompare(timeKey(b.task)) ||
        a.task.title.localeCompare(b.task.title),
    )[0];
  if (!best) return null;
  const t = best.task;
  const d = deadlineDate(t);
  const reason: NextReason =
    t.status === 'doing'
      ? 'doing'
      : d && d < ctx.today
        ? 'overdue'
        : t.startAt && Date.parse(t.startAt) > nowMs
          ? 'starting'
          : t.startAt
            ? 'scheduled'
            : d === ctx.today
              ? 'due_today'
              : 'anytime';
  return { ...best, reason };
}

/** นัดที่ยังไม่เริ่มและจะเริ่มภายใน withinMin นาที (ไม่นับงานที่ถูกแนะนำอยู่แล้ว) */
export function upcomingAppointment(
  tasks: PlanTask[],
  now: Date,
  withinMin = 30,
  excludeId?: string,
): { task: PlanTask; minutes: number } | null {
  const nowMs = now.getTime();
  const hit = tasks
    .filter((t) => isOpen(t) && isAppointment(t) && t.id !== excludeId)
    .map((t) => ({ task: t, minutes: Math.ceil((Date.parse(t.startAt!) - nowMs) / 60_000) }))
    .filter((x) => x.minutes > 0 && x.minutes <= withinMin)
    .sort((a, b) => a.minutes - b.minutes)[0];
  return hit ?? null;
}

// ---------------------------------------------------------------- Insight ของ Dobby
export type Mood = 'relaxed' | 'busy' | 'happy';
export type InsightKind =
  'empty' | 'carry' | 'all_done' | 'over' | 'deadline' | 'warn' | 'light' | 'off';
export interface Insight {
  kind: InsightKind;
  mood: Mood;
  text: string;
}

/**
 * ข้อความบรรทัดเดียวจากข้อมูลจริงของวัน (ลำดับความสำคัญ):
 * ไม่มีงาน → ทำครบแล้ว → วันโหลดเกิน → มีเดดไลน์ค้างวันนี้ → ค่อนข้างเต็ม → วันหยุด → โหลดเบา
 * tasks = งานที่กำหนดไว้วันนี้ (รวมเสร็จแล้ว/นัด), overdueCount = งานเลยกำหนดที่ยังค้าง
 */
export function insight(p: {
  today: string;
  tasks: PlanTask[];
  overdueCount: number;
  load: DayLoad;
}): Insight {
  const live = p.tasks.filter(isLive);
  const open = live.filter(isOpen);
  const done = live.length - open.length;
  if (live.length === 0 && p.overdueCount === 0)
    return {
      kind: 'empty',
      mood: 'relaxed',
      text: 'วันนี้ยังไม่มีงาน พักสบาย ๆ ได้เลย หรือจะเพิ่มงานก็ได้นะ',
    };
  if (live.length === 0)
    return {
      kind: 'carry',
      mood: 'relaxed',
      text: `วันนี้ไม่มีงานที่กำหนดไว้ แต่มีงานค้าง ${p.overdueCount} งาน ลองเคลียร์สักอันไหม`,
    };
  if (open.length === 0 && p.overdueCount === 0)
    return { kind: 'all_done', mood: 'happy', text: `ทำครบทั้ง ${live.length} งานแล้ว เก่งมาก 🎉` };

  const l = p.load;
  const n = open.length;
  if (l.status === 'over')
    return {
      kind: 'over',
      mood: 'busy',
      text:
        l.available > 0
          ? `วันนี้แน่นไปหน่อย งานรวม ${fmtDuration(l.planned)} แต่ว่างแค่ ${fmtDuration(l.available)} ลองย้ายสักงานไหม`
          : `วันนี้เวลาเต็มแล้ว แต่ยังมีงาน ${fmtDuration(l.planned)} ลองย้ายสักงานไหม`,
    };
  // เดดไลน์ = งานที่มีเวลาสิ้นสุด (dueAt) ภายในวันนี้; งานทั้งวันที่มีแค่วันที่ถือเป็นงานของวันนั้น ไม่ใช่เดดไลน์
  const withDeadline = open
    .filter((t) => !!t.dueAt && bkYmd(t.dueAt) === p.today)
    .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
  if (withDeadline.length) {
    const first = withDeadline[0]!;
    const when = `ก่อน ${minToHm(bkMinute(first.dueAt!))}`;
    return {
      kind: 'deadline',
      mood: 'busy',
      text: `เหลือเดดไลน์ ${withDeadline.length} งาน${withDeadline.length > 1 ? ' เร็วสุด' : ''} ${when}`,
    };
  }
  if (l.status === 'off')
    return {
      kind: 'off',
      mood: 'relaxed',
      text: `วันนี้วันหยุด มี ${n} งาน (ราว ${fmtDuration(l.planned)}) ทำเท่าที่สบายใจนะ`,
    };
  if (l.status === 'warn')
    return {
      kind: 'warn',
      mood: 'busy',
      text: `วันนี้ค่อนข้างเต็ม ${n} งาน ใช้ราว ${fmtDuration(l.planned)} ว่างอีก ${fmtDuration(Math.max(0, l.available - l.planned))}`,
    };
  return {
    kind: 'light',
    mood: done > 0 && n <= 1 ? 'happy' : 'relaxed',
    text: `วันนี้มี ${n} งาน ใช้ราว ${fmtDuration(l.planned)} ว่างอีก ${fmtDuration(Math.max(0, l.available - l.planned))} 👍`,
  };
}

// ---------------------------------------------------------------- timeline ของวัน
export type TimelineEntry =
  | {
      kind: 'item';
      task: PlanTask;
      startMin: number;
      endMin: number;
      point: boolean;
      past: boolean;
    }
  | { kind: 'gap'; startMin: number; endMin: number }
  | { kind: 'now'; min: number };

/**
 * งานที่มีเวลาของวัน ymd เรียงตามเวลา + เส้น "ตอนนี้" + ช่วงว่าง ≥ 45 นาที ภายในชั่วโมงทำงาน
 * (ถ้าเป็นวันนี้ ช่วงว่างนับตั้งแต่ตอนนี้เป็นต้นไป) ; งานที่ไม่มีเวลา (ทั้งวัน/ไม่ระบุ) ไม่อยู่ใน timeline
 */
export function buildTimeline(
  tasks: PlanTask[],
  ymd: string,
  work: WorkHours,
  now: Date,
  gapMin = GAP_MIN,
): TimelineEntry[] {
  const nowYmd = bkYmd(now.toISOString());
  const isToday = nowYmd === ymd;
  const nowMin = bkMinute(now.toISOString());
  const items: Extract<TimelineEntry, { kind: 'item' }>[] = [];
  for (const t of tasks) {
    if (!isLive(t) || t.allDay) continue;
    if (t.startAt && bkYmd(t.startAt) === ymd) {
      const startMin = bkMinute(t.startAt);
      const hasEnd = !!t.endAt && t.endAt > t.startAt && bkYmd(t.endAt) === ymd;
      const endMin = hasEnd ? bkMinute(t.endAt!) : startMin + (t.estimateMinutes ?? 0);
      const point = !hasEnd && !t.estimateMinutes;
      items.push({
        kind: 'item',
        task: t,
        startMin,
        endMin: Math.min(DAY_MIN, endMin),
        point,
        past: isToday && endMin < nowMin,
      });
    } else if (!t.startAt && t.dueAt && bkYmd(t.dueAt) === ymd) {
      const m = bkMinute(t.dueAt);
      items.push({
        kind: 'item',
        task: t,
        startMin: m,
        endMin: m,
        point: true,
        past: isToday && m < nowMin,
      });
    }
  }
  items.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const ws = hmToMin(work.start);
  const we = Math.max(ws, hmToMin(work.end));
  const out: TimelineEntry[] = [];
  let cursor = isToday ? Math.max(ws, nowMin) : ws;
  let nowPlaced = !isToday;
  const placeNow = (before: number) => {
    if (!nowPlaced && nowMin <= before) {
      out.push({ kind: 'now', min: nowMin });
      nowPlaced = true;
    }
  };
  for (const it of items) {
    // ช่วงว่างก่อนรายการนี้ (นับเฉพาะส่วนที่อยู่ในชั่วโมงทำงาน)
    const gapEnd = Math.min(it.startMin, we);
    if (gapEnd - cursor >= gapMin) {
      placeNow(cursor);
      out.push({ kind: 'gap', startMin: cursor, endMin: gapEnd });
    }
    placeNow(it.startMin);
    out.push(it);
    cursor = Math.max(cursor, it.endMin);
  }
  if (we - cursor >= gapMin) {
    placeNow(cursor);
    out.push({ kind: 'gap', startMin: cursor, endMin: we });
  }
  if (!nowPlaced) out.push({ kind: 'now', min: nowMin });
  return out;
}

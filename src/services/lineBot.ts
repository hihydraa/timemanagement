import { and, desc, eq, gte, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { getDb } from '../db/client';
import {
  categories,
  lineEvents,
  lineLinkCodes,
  lineState,
  tasks,
  userSettings,
  users,
} from '../db/schema';
import { ApiError } from '../lib/http';
import { addDays, bangkokDate, bangkokParts, fromBangkok, now, nowIso } from '../lib/time';
import type { Env } from '../types';
import { limitsFrom, saveUploads } from './attachments';
import { matchesMagic, sanitizeFilename } from './files';
import { removeEventSafe, syncTaskSafe } from './googleCalendar';
import {
  clip,
  confirmDelete,
  dayLabel,
  HELP_TEXT,
  LINK_HELP,
  listCard,
  quickMessage,
  quickPostback,
  taskCard,
  taskDate,
  text,
  whenText,
  type ListSection,
  type MascotPose,
  type QuickItem,
} from './flex';
import { getMessageContent, replyMessages, type LineMessage } from './line';
import { confirmAlternatives, parseTask, type ParsedTask } from './parser';
import {
  carryOver,
  createTask,
  getOwned,
  inboxTasks,
  listTasks,
  openTasks,
  snoozeTask,
  taskInput,
  taskLimit,
  todayBuckets,
  updateTask,
  deleteTask,
  withTags,
  type TaskDto,
} from './tasks';

export interface LineEvent {
  type: string;
  webhookEventId?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: {
    id?: string;
    type?: string;
    text?: string;
    fileName?: string;
    contentProvider?: { type?: string };
  };
  postback?: { data?: string };
}

interface Ctx {
  env: Env;
  db: Db;
  lineUserId: string;
  replyToken?: string;
}
type User = typeof users.$inferSelect;
interface PendingMedia {
  mid: string;
  kind: string;
  name: string | null;
  at: string;
}

const MIN = 60_000;
const send = (ctx: Ctx, msgs: LineMessage[]) =>
  ctx.replyToken ? replyMessages(ctx.env, ctx.replyToken, msgs) : Promise.resolve();

/** ตอบ LINE ก่อน แล้วค่อยซิงก์ Google Calendar (best-effort ไม่กระทบการตอบ) */
async function replyThenSync(ctx: Ctx, userId: string, taskId: string, msgs: LineMessage[]) {
  await send(ctx, msgs);
  await syncTaskSafe(ctx.env, userId, taskId);
}

// ---------------------------------------------------------------- entry
export async function processEvents(env: Env, events: LineEvent[]): Promise<void> {
  const db = getDb(env.DB);
  const cutoff = new Date(now().getTime() - 7 * 86_400_000).toISOString();
  await db
    .delete(lineEvents)
    .where(lt(lineEvents.createdAt, cutoff))
    .catch(() => undefined);

  for (const ev of events) {
    try {
      if (ev.webhookEventId) {
        // กัน event ซ้ำ (LINE ส่งซ้ำได้): แทรกไม่สำเร็จ = เคยประมวลผลแล้ว
        const ins = await db
          .insert(lineEvents)
          .values({ id: ev.webhookEventId, createdAt: nowIso() })
          .onConflictDoNothing()
          .returning({ id: lineEvents.id });
        if (ins.length === 0) continue;
      }
      await handleEvent(env, db, ev);
    } catch (e) {
      console.error('line event failed', e instanceof Error ? e.message : 'unknown');
    }
  }
}

async function handleEvent(env: Env, db: Db, ev: LineEvent): Promise<void> {
  if (ev.source?.type !== 'user' || !ev.source.userId) return; // รองรับเฉพาะแชทส่วนตัว
  const ctx: Ctx = { env, db, lineUserId: ev.source.userId, replyToken: ev.replyToken };
  try {
    if (ev.type === 'follow') {
      return await send(ctx, [text(`สวัสดี! ฉันคือ Dobby ผู้ช่วยจัดการเวลา 🗓\n\n${LINK_HELP}`)]);
    }
    if (ev.type === 'message' && ev.message?.type === 'text') {
      const t = (ev.message.text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
      if (!t) return;
      if (t.length > 500) return await send(ctx, [text('ข้อความยาวเกินไป (สูงสุด 500 ตัวอักษร)')]);
      const link = /^ผูกบัญชี\s*(\d{6})$/.exec(t);
      if (link) return await linkAccount(ctx, link[1]!);
      const user = await userByLine(db, ctx.lineUserId);
      if (!user) return await send(ctx, [text(LINK_HELP)]);
      return await handleText(ctx, user, t);
    }
    if (ev.type === 'message' && (ev.message?.type === 'image' || ev.message?.type === 'file')) {
      const user = await userByLine(db, ctx.lineUserId);
      if (!user) return await send(ctx, [text(LINK_HELP)]);
      return await handleMedia(ctx, user, ev);
    }
    if (ev.type === 'postback' && ev.postback?.data) {
      const user = await userByLine(db, ctx.lineUserId);
      if (!user) return await send(ctx, [text(LINK_HELP)]);
      return await handlePostback(ctx, user, ev.postback.data);
    }
  } catch (e) {
    if (e instanceof ApiError) return send(ctx, [text(e.message)]);
    console.error('line handler error', e instanceof Error ? e.message : 'unknown');
    return send(ctx, [text('เกิดข้อผิดพลาด ลองใหม่อีกครั้งนะ')]);
  }
}

const userByLine = (db: Db, lineUserId: string) =>
  db.select().from(users).where(eq(users.lineUserId, lineUserId)).get();

// ---------------------------------------------------------------- state
async function getState(db: Db, lineUserId: string) {
  return db.select().from(lineState).where(eq(lineState.lineUserId, lineUserId)).get();
}
async function upsertState(
  db: Db,
  lineUserId: string,
  patch: Partial<typeof lineState.$inferInsert>,
) {
  await db
    .insert(lineState)
    .values({ lineUserId, ...patch })
    .onConflictDoUpdate({ target: lineState.lineUserId, set: patch });
}
export const setList = (db: Db, lineUserId: string, ids: string[]) =>
  upsertState(db, lineUserId, { listJson: JSON.stringify(ids), listAt: nowIso() });
async function getList(db: Db, lineUserId: string): Promise<string[]> {
  const s = await getState(db, lineUserId);
  try {
    const v: unknown = s?.listJson ? JSON.parse(s.listJson) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- link account
const MAX_LINK_FAILS = 5;
const LINK_WINDOW_MS = 10 * MIN;

async function linkAccount(ctx: Ctx, code: string): Promise<void> {
  const { db, lineUserId } = ctx;
  const st = await getState(db, lineUserId);
  const inWindow =
    !!st?.failWindowAt && now().getTime() - Date.parse(st.failWindowAt) < LINK_WINDOW_MS;
  const fails = inWindow ? (st?.failCount ?? 0) : 0;
  if (fails >= MAX_LINK_FAILS) {
    return send(ctx, [text('ลองรหัสผิดหลายครั้งเกินไป กรุณารอ 10 นาทีแล้วลองใหม่')]);
  }
  const fail = async (msg: string) => {
    await upsertState(db, lineUserId, {
      failCount: fails + 1,
      failWindowAt: inWindow ? st!.failWindowAt : nowIso(),
    });
    return send(ctx, [text(msg)]);
  };

  const row = await db.select().from(lineLinkCodes).where(eq(lineLinkCodes.code, code)).get();
  if (!row || row.expiresAt < nowIso()) {
    return fail('รหัสไม่ถูกต้องหรือหมดอายุ ❌\nกรุณากดปุ่ม "เชื่อม LINE" ในเว็บเพื่อรับรหัสใหม่');
  }
  const target = await db.select().from(users).where(eq(users.id, row.userId)).get();
  if (!target) return fail('รหัสไม่ถูกต้องหรือหมดอายุ ❌');

  const mine = await userByLine(db, lineUserId);
  if (mine && mine.id !== target.id) {
    return send(ctx, [text('LINE นี้ผูกกับบัญชี Dobby อื่นอยู่แล้ว จึงผูกซ้ำไม่ได้')]);
  }
  if (target.lineUserId && target.lineUserId !== lineUserId) {
    return send(ctx, [
      text('บัญชี Dobby นี้ผูกกับ LINE อื่นอยู่แล้ว กรุณายกเลิกการเชื่อมจากหน้าเว็บก่อน'),
    ]);
  }
  await db.update(users).set({ lineUserId }).where(eq(users.id, target.id));
  await db.delete(lineLinkCodes).where(eq(lineLinkCodes.code, code)); // ใช้ได้ครั้งเดียว
  await upsertState(db, lineUserId, { failCount: 0, failWindowAt: null });
  return send(ctx, [
    text(
      `ผูกบัญชีสำเร็จ ✅\nสวัสดีคุณ ${target.name || target.email}\n\nลองพิมพ์งานได้เลย เช่น "ส่งรายงาน พรุ่งนี้ 14:00 #งาน !ด่วน"\nหรือพิมพ์ "ช่วยเหลือ" เพื่อดูวิธีใช้`,
      [quickMessage('งานวันนี้', 'วันนี้'), quickMessage('ช่วยเหลือ', 'ช่วยเหลือ')],
    ),
  ]);
}

// ---------------------------------------------------------------- text commands
const RE = {
  help: /^(ช่วยเหลือ|help|วิธีใช้|เมนู)$/i,
  add: /^เพิ่มงาน$/,
  today: /^(วันนี้|งานวันนี้)$/,
  tomorrow: /^(พรุ่งนี้|งานพรุ่งนี้)$/,
  week: /^(สัปดาห์นี้|งานสัปดาห์นี้|อาทิตย์นี้)$/,
  overdue: /^(ค้างอยู่|เลยกำหนด|งานค้าง|งานเลยกำหนด)$/,
  inbox: /^(inbox|อินบ็อกซ์|ยังไม่กำหนดวัน)$/i,
  notifyOn: /^เปิดแจ้งเตือน$/,
  notifyOff: /^ปิดแจ้งเตือน$/,
  done: /^เสร็จ\s+(.+)$/,
  del: /^ลบ\s+(.+)$/,
  snooze: /^เลื่อน\s+(.+)$/,
};

async function handleText(ctx: Ctx, user: User, t: string): Promise<void> {
  if (RE.help.test(t)) return send(ctx, [text(HELP_TEXT)]);
  if (RE.add.test(t)) {
    return send(ctx, [
      text(
        'พิมพ์ชื่องานพร้อมวัน/เวลาได้เลย เช่น\nส่งรายงาน พรุ่งนี้ 14:00 #งาน !ด่วน\nซื้อของเข้าบ้าน (ไม่ระบุวัน = เก็บไว้ใน Inbox)',
      ),
    ]);
  }
  if (RE.today.test(t)) return cmdToday(ctx, user);
  if (RE.tomorrow.test(t)) return cmdDay(ctx, user, addDays(bangkokDate(now()), 1), 'พรุ่งนี้');
  if (RE.week.test(t)) return cmdWeek(ctx, user);
  if (RE.overdue.test(t)) return cmdOverdue(ctx, user);
  if (RE.inbox.test(t)) return cmdInbox(ctx, user);
  if (RE.notifyOn.test(t)) return setNotify(ctx, user, true);
  if (RE.notifyOff.test(t)) return setNotify(ctx, user, false);
  let m = RE.done.exec(t);
  if (m) return cmdDone(ctx, user, m[1]!);
  m = RE.del.exec(t);
  if (m) return cmdDelete(ctx, user, m[1]!);
  m = RE.snooze.exec(t);
  if (m) return cmdSnooze(ctx, user, m[1]!);
  return cmdCreate(ctx, user, t);
}

const baseUrl = (ctx: Ctx) => ctx.env.APP_BASE_URL.replace(/\/$/, '');
const isOpen = (t: TaskDto) => t.status === 'todo' || t.status === 'doing';
const sortKey = (t: TaskDto) => t.startAt ?? t.dueAt ?? '';

async function reply(
  ctx: Ctx,
  heading: string,
  sections: ListSection[],
  emptyText: string,
  pose?: MascotPose,
) {
  if (sections.every((s) => s.tasks.length === 0)) return send(ctx, [text(emptyText)]);
  const { message, ids } = listCard(heading, sections, baseUrl(ctx), pose);
  await setList(ctx.db, ctx.lineUserId, ids);
  return send(ctx, [message]);
}

async function cmdToday(ctx: Ctx, user: User) {
  const b = await todayBuckets(ctx.db, user.id, now());
  return reply(
    ctx,
    `📅 วันนี้ ${dayLabel(b.date)}`,
    [
      { title: '🔴 เลยกำหนด', color: '#dc2626', tasks: b.overdue },
      { title: '⏰ เดดไลน์วันนี้', color: '#ea580c', tasks: b.dueToday },
      { title: 'งานวันนี้', tasks: b.today },
    ],
    'วันนี้ไม่มีงาน 🎉',
    'morning',
  );
}

async function openOnDay(ctx: Ctx, user: User, from: string, toExclusive: string) {
  const list = await listTasks(ctx.db, user.id, {
    from: fromBangkok(from).toISOString(),
    to: fromBangkok(toExclusive).toISOString(),
  });
  return list.filter(isOpen).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

async function cmdDay(ctx: Ctx, user: User, date: string, label: string) {
  const list = await openOnDay(ctx, user, date, addDays(date, 1));
  return reply(
    ctx,
    `📅 ${label} ${dayLabel(date)}`,
    [{ title: 'งาน', tasks: list }],
    `${label}ยังไม่มีงาน`,
  );
}

async function cmdWeek(ctx: Ctx, user: User) {
  const today = bangkokDate(now());
  const wd = bangkokParts(fromBangkok(today)).weekday;
  const monday = addDays(today, -((wd + 6) % 7));
  const list = await openOnDay(ctx, user, monday, addDays(monday, 7));
  const sections: ListSection[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    sections.push({
      title: `${dayLabel(d)}${d === today ? ' (วันนี้)' : ''}`,
      color: d === today ? '#3d6552' : undefined,
      tasks: list.filter((t) => taskDate(t) === d),
    });
  }
  return reply(ctx, '📆 สัปดาห์นี้', sections, 'สัปดาห์นี้ยังไม่มีงาน');
}

async function cmdOverdue(ctx: Ctx, user: User) {
  const b = await todayBuckets(ctx.db, user.id, now());
  return reply(
    ctx,
    '🔴 งานเลยกำหนด',
    [{ title: 'ค้างอยู่', color: '#dc2626', tasks: b.overdue }],
    'ไม่มีงานค้าง เยี่ยมมาก! 🎉',
    'deadline',
  );
}

async function cmdInbox(ctx: Ctx, user: User) {
  const list = await inboxTasks(ctx.db, user.id);
  return reply(
    ctx,
    '📥 Inbox (ยังไม่กำหนดวัน)',
    [{ title: 'รอจัดลงปฏิทิน', tasks: list }],
    'Inbox ว่างเปล่า ✨',
  );
}

async function setNotify(ctx: Ctx, user: User, on: boolean) {
  await ctx.db
    .insert(userSettings)
    .values({ userId: user.id, lineNotifyEnabled: on ? 1 : 0 })
    .onConflictDoUpdate({ target: userSettings.userId, set: { lineNotifyEnabled: on ? 1 : 0 } });
  return send(ctx, [
    text(
      on ? '🔔 เปิดแจ้งเตือนแล้ว' : '🔕 ปิดแจ้งเตือนแล้ว (เปิดใหม่ได้ด้วยคำว่า "เปิดแจ้งเตือน")',
    ),
  ]);
}

// ---------------------------------------------------------------- refs
type Ref = { ok: true; task: TaskDto } | { ok: false; reply: LineMessage[] };

async function resolveRef(ctx: Ctx, user: User, ref: string): Promise<Ref> {
  const { db } = ctx;
  if (/^\d{1,3}$/.test(ref)) {
    const id = (await getList(db, ctx.lineUserId))[Number(ref) - 1];
    if (!id)
      return {
        ok: false,
        reply: [text(`ไม่พบรายการเลข ${ref} — พิมพ์ "วันนี้" เพื่อดูรายการล่าสุดก่อนนะ`)],
      };
    try {
      return { ok: true, task: (await withTags(db, [await getOwned(db, user.id, id)]))[0]! };
    } catch {
      return { ok: false, reply: [text('ไม่พบงานนี้ (อาจถูกลบแล้ว)')] };
    }
  }
  const q = ref.toLowerCase();
  const all = await openTasks(db, user.id);
  const exact = all.filter((t) => t.title.toLowerCase() === q);
  const found = exact.length ? exact : all.filter((t) => t.title.toLowerCase().includes(q));
  if (found.length === 1) return { ok: true, task: found[0]! };
  if (found.length === 0) return { ok: false, reply: [text(`ไม่พบงานชื่อ "${clip(ref, 40)}"`)] };
  const { message, ids } = listCard(
    `พบ ${found.length} งานที่ตรงกับ "${clip(ref, 20)}" — พิมพ์คำสั่งเดิมตามด้วยเลข`,
    [{ title: 'งานที่พบ', tasks: found.slice(0, 8) }],
    baseUrl(ctx),
  );
  await setList(db, ctx.lineUserId, ids);
  return { ok: false, reply: [message] };
}

async function cmdDone(ctx: Ctx, user: User, ref: string) {
  const r = await resolveRef(ctx, user, ref);
  if (!r.ok) return send(ctx, r.reply);
  if (r.task.status === 'done')
    return send(ctx, [text(`งานนี้เสร็จไปแล้ว: ${clip(r.task.title, 80)}`)]);
  const done = await updateTask(ctx.db, user.id, r.task.id, { status: 'done' });
  return replyThenSync(ctx, user.id, done.id, [text(`✅ เสร็จแล้ว: ${clip(r.task.title, 80)}`)]);
}

async function cmdDelete(ctx: Ctx, user: User, ref: string) {
  const r = await resolveRef(ctx, user, ref);
  if (!r.ok) return send(ctx, r.reply);
  return send(ctx, [confirmDelete(r.task)]);
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** ย้ายงานไปวัน/เวลาใหม่ โดยรักษาเวลาเดิม/ความยาวไว้ถ้าไม่ได้ระบุเวลาใหม่ */
export async function reschedule(
  db: Db,
  userId: string,
  task: TaskDto,
  newDate: string,
  newTime?: string,
) {
  const at = (d: string, t: string) => fromBangkok(d, t).toISOString();
  const anchor = task.startAt
    ? bangkokDate(new Date(task.startAt))
    : task.dueAt
      ? bangkokDate(new Date(task.dueAt))
      : task.dueDate;
  if (!anchor) {
    return updateTask(
      db,
      userId,
      task.id,
      newTime
        ? {
            allDay: false,
            startAt: at(newDate, newTime),
            endAt: null,
            dueAt: null,
            dueDate: null,
            status: 'todo',
          }
        : { allDay: true, dueDate: newDate, status: 'todo' },
    );
  }
  const delta = daysBetween(anchor, newDate) * 86_400_000;
  const shift = (s: string | null) => (s ? new Date(Date.parse(s) + delta).toISOString() : null);
  const patch = {
    allDay: task.allDay,
    startAt: shift(task.startAt),
    endAt: shift(task.endAt),
    dueAt: shift(task.dueAt),
    dueDate: task.allDay ? newDate : null,
    status: 'todo' as const,
  };
  if (newTime) {
    if (task.startAt) {
      const dur = task.endAt ? Date.parse(task.endAt) - Date.parse(task.startAt) : null;
      const start = fromBangkok(newDate, newTime);
      patch.startAt = start.toISOString();
      patch.endAt = dur === null ? null : new Date(start.getTime() + dur).toISOString();
    } else if (task.dueAt) {
      patch.dueAt = at(newDate, newTime);
    } else {
      patch.allDay = false;
      patch.dueDate = null;
      patch.startAt = at(newDate, newTime);
      patch.endAt = null;
    }
  }
  return updateTask(db, userId, task.id, patch);
}

/**
 * แยก "ชื่อ/เลขงาน" ออกจาก "วัน/เวลาใหม่" ในคำสั่งเลื่อน
 * ลองตัดคำท้ายประโยคที่เป็นวัน/เวลาล้วน ๆ โดยชื่อที่เหลือต้องตรงกับงานจริง
 * (กันกรณีชื่องานมีคำว่า "พรุ่งนี้" อยู่ในตัว) ถ้าไม่ได้ ค่อย parse ทั้งประโยค
 */
async function splitSnooze(ctx: Ctx, user: User, rest: string) {
  const words = rest.split(' ');
  const open = await openTasks(ctx.db, user.id);
  for (let i = words.length - 1; i >= 1; i--) {
    const ref = words.slice(0, i).join(' ');
    const w = parseTask(words.slice(i).join(' '), now());
    if (w.title || !(w.date || w.due || w.time)) continue;
    const known =
      /^\d{1,3}$/.test(ref) || open.some((t) => t.title.toLowerCase().includes(ref.toLowerCase()));
    if (known) return { ref, date: w.date ?? w.due?.date, time: w.time ?? w.due?.time };
  }
  // ทั้งประโยคตรงกับชื่องานพอดี (เช่น งานชื่อ "งานศุกร์") = ชื่องาน ไม่ใช่วันที่
  if (open.some((t) => t.title.toLowerCase() === rest.toLowerCase())) {
    return { ref: rest, date: undefined, time: undefined };
  }
  const p = parseTask(rest, now());
  return { ref: p.title, date: p.date ?? p.due?.date, time: p.time ?? p.due?.time };
}

async function cmdSnooze(ctx: Ctx, user: User, rest: string) {
  const { ref, date: newDate, time: newTime } = await splitSnooze(ctx, user, rest);
  if (!ref)
    return send(ctx, [
      text('ระบุงานที่จะเลื่อนด้วยนะ เช่น "เลื่อน 2 พรุ่งนี้" หรือ "เลื่อน ส่งรายงาน ศุกร์"'),
    ]);
  if (!newDate) {
    const items = ['พรุ่งนี้', 'มะรืน', 'สัปดาห์หน้า'].map((w) =>
      quickMessage(w, `เลื่อน ${clip(ref, 30)} ${w}`),
    );
    return send(ctx, [text(`เลื่อน "${clip(ref, 40)}" ไปเมื่อไหร่?`, items)]);
  }
  const r = await resolveRef(ctx, user, ref);
  if (!r.ok) return send(ctx, r.reply);
  const moved = await reschedule(ctx.db, user.id, r.task, newDate, newTime);
  return replyThenSync(ctx, user.id, moved.id, [await card(ctx, moved, '⏰ เลื่อนแล้ว')]);
}

// ---------------------------------------------------------------- create
async function card(ctx: Ctx, t: TaskDto, heading: string): Promise<LineMessage> {
  const cat = t.categoryId
    ? await ctx.db
        .select()
        .from(categories)
        .where(and(eq(categories.id, t.categoryId), eq(categories.userId, t.userId)))
        .get()
    : undefined;
  return taskCard(t, {
    baseUrl: baseUrl(ctx),
    categoryName: cat?.name,
    categoryColor: cat?.color,
    heading,
  });
}

/** แปลงผล parse เป็น input ของงาน */
export function toTaskInput(p: ParsedTask) {
  const base = {
    title: p.title,
    urgency: p.urgency ?? 2,
    importance: p.importance ?? 2,
    categoryId: p.categoryId ?? null,
    tags: p.tags,
    estimateMinutes: p.estimateMinutes ?? null,
    recurrenceRule: p.recurrence ?? null,
    source: 'line' as const,
  };
  const iso = (d: string, t: string) => fromBangkok(d, t).toISOString();
  if (p.date && p.time) {
    const start = fromBangkok(p.date, p.time);
    let end: Date | null = null;
    if (p.endTime) {
      end = fromBangkok(p.date, p.endTime);
      if (end <= start) end = new Date(end.getTime() + 86_400_000);
    } else if (p.estimateMinutes) {
      end = new Date(start.getTime() + p.estimateMinutes * MIN);
    }
    return taskInput.parse({
      ...base,
      allDay: false,
      startAt: start.toISOString(),
      endAt: end?.toISOString() ?? null,
      dueAt: p.due?.time ? iso(p.due.date, p.due.time) : null,
    });
  }
  if (p.due?.time)
    return taskInput.parse({ ...base, allDay: false, dueAt: iso(p.due.date, p.due.time) });
  if (p.due) return taskInput.parse({ ...base, allDay: true, dueDate: p.due.date });
  if (p.date) return taskInput.parse({ ...base, allDay: true, dueDate: p.date });
  return taskInput.parse(base); // ไม่มีวัน/เวลา → Inbox
}

async function cmdCreate(ctx: Ctx, user: User, t: string) {
  const { db } = ctx;
  const cats = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, user.id));
  const p = parseTask(t, now(), cats);

  if (!p.title) {
    return send(ctx, [
      text(
        'ต้องการให้เรียกงานนี้ว่าอะไร? พิมพ์ชื่องานพร้อมวัน/เวลาอีกครั้ง เช่น "ส่งรายงาน พรุ่งนี้ 14:00"',
      ),
    ]);
  }
  if (p.needsConfirm) {
    const alts = confirmAlternatives(t, p).filter((a) => a.text.length <= 300);
    const what =
      p.needsConfirm.reason === 'past_time'
        ? 'เวลาของวันนี้ผ่านไปแล้ว'
        : `วันที่ ${dayLabel(p.needsConfirm.date)} ผ่านมาแล้ว`;
    const quick: QuickItem[] = alts.map((a) => quickMessage(a.label, a.text));
    return send(ctx, [
      text(
        `⚠️ ${what} ต้องการบันทึกอย่างไร?${quick.length ? '' : '\n(พิมพ์ใหม่พร้อมวันที่ที่ถูกต้อง หรือเติม !ok ท้ายข้อความเพื่อยืนยัน)'}`,
        quick,
      ),
    ]);
  }

  const task = await createTask(db, user.id, toTaskInput(p), taskLimit(ctx.env));
  const msgs: LineMessage[] = [await card(ctx, task, '✅ บันทึกงานแล้ว')];
  if (!task.startAt && !task.dueAt && !task.dueDate) {
    msgs.push(
      text('บันทึกไว้ใน Inbox แล้ว ต้องการกำหนดวันไหม?', [
        quickPostback('วันนี้', `a=sched&id=${task.id}&w=today`),
        quickPostback('พรุ่งนี้', `a=sched&id=${task.id}&w=tomorrow`),
        quickPostback('สัปดาห์หน้า', `a=sched&id=${task.id}&w=nextweek`),
      ]),
    );
  }
  return replyThenSync(ctx, user.id, task.id, msgs);
}

// ---------------------------------------------------------------- postback
async function handlePostback(ctx: Ctx, user: User, data: string) {
  const { db } = ctx;
  const q = new URLSearchParams(data);
  const a = q.get('a');
  const id = q.get('id') ?? '';
  switch (a) {
    case 'done': {
      const t = await getOwned(db, user.id, id);
      const done = await updateTask(db, user.id, id, { status: 'done' });
      return replyThenSync(ctx, user.id, done.id, [text(`✅ เสร็จแล้ว: ${clip(t.title, 80)}`)]);
    }
    case 'snz': {
      const minutes = Number(q.get('m') ?? 0);
      const days = Number(q.get('d') ?? 0);
      const by =
        Number.isInteger(minutes) && minutes > 0 && minutes <= 43200
          ? { minutes }
          : Number.isInteger(days) && days > 0 && days <= 365
            ? { days }
            : null;
      if (!by) return send(ctx, [text('คำสั่งไม่ถูกต้อง')]);
      const moved = await snoozeTask(db, user.id, id, by);
      return replyThenSync(ctx, user.id, moved.id, [await card(ctx, moved, '⏰ เลื่อนแล้ว')]);
    }
    case 'del': {
      const t = await getOwned(db, user.id, id);
      return send(ctx, [confirmDelete((await withTags(db, [t]))[0]!)]);
    }
    case 'delok': {
      const t = await getOwned(db, user.id, id);
      const res = await deleteTask(db, ctx.env.FILES, user.id, id); // งานทำซ้ำ = ลบเฉพาะครั้งนี้
      await send(ctx, [text(`🗑 ลบแล้ว: ${clip(t.title, 80)}`)]);
      for (const e of res.gcalEventIds) await removeEventSafe(ctx.env, user.id, e);
      return res.tombstoneId
        ? void (await syncTaskSafe(ctx.env, user.id, res.tombstoneId))
        : undefined;
    }
    case 'carry': {
      // ปุ่มจากสรุปเย็น: เลื่อนงานค้างของวัน d ไปวันถัดไป (d ต้องเป็นวันล่าสุด กันปุ่มเก่าทำงานผิดวัน)
      const d = q.get('d') ?? '';
      const today = bangkokDate(now());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today || d < addDays(today, -3)) {
        return send(ctx, [text('ปุ่มนี้หมดอายุแล้ว')]);
      }
      const { movedIds, hasMore } = await carryOver(db, user.id, d);
      await send(ctx, [
        text(
          movedIds.length
            ? `⏭ เลื่อน ${movedIds.length} งานไป ${dayLabel(addDays(d, 1))} แล้ว${hasMore ? '\n(ยังมีงานเหลืออีก กดปุ่มอีกครั้งเพื่อเลื่อนต่อ)' : ''}`
            : 'ไม่มีงานค้างให้เลื่อนแล้ว',
        ),
      ]);
      for (const id of movedIds) await syncTaskSafe(ctx.env, user.id, id);
      return;
    }
    case 'cancel':
      return send(ctx, [text('ยกเลิกแล้ว')]);
    case 'sched': {
      const today = bangkokDate(now());
      const w = q.get('w');
      const date =
        w === 'today'
          ? today
          : w === 'tomorrow'
            ? addDays(today, 1)
            : w === 'nextweek'
              ? addDays(today, 7 - ((bangkokParts(fromBangkok(today)).weekday + 6) % 7))
              : null;
      if (!date) return send(ctx, [text('คำสั่งไม่ถูกต้อง')]);
      await getOwned(db, user.id, id);
      const scheduled = await updateTask(db, user.id, id, { allDay: true, dueDate: date });
      return replyThenSync(ctx, user.id, scheduled.id, [
        await card(ctx, scheduled, '📅 กำหนดวันแล้ว'),
      ]);
    }
    case 'att': {
      await getOwned(db, user.id, id);
      const st = await getState(db, ctx.lineUserId);
      let media: PendingMedia | null = null;
      try {
        media = st?.pendingMedia ? (JSON.parse(st.pendingMedia) as PendingMedia) : null;
      } catch {
        media = null;
      }
      if (!media || now().getTime() - Date.parse(media.at) > 30 * MIN) {
        return send(ctx, [text('ไม่พบไฟล์ที่รอแนบ (หมดอายุแล้ว) กรุณาส่งไฟล์ใหม่อีกครั้ง')]);
      }
      await attachMedia(ctx, user, id, media);
      await upsertState(db, ctx.lineUserId, { pendingMedia: null });
      return;
    }
    default:
      return send(ctx, [text('คำสั่งไม่ถูกต้อง')]);
  }
}

// ---------------------------------------------------------------- media
const RECENT_MS = 10 * MIN;

function imageExt(b: Uint8Array): string | null {
  if (matchesMagic('jpeg', b)) return 'jpg';
  if (matchesMagic('png', b)) return 'png';
  if (matchesMagic('gif', b)) return 'gif';
  if (matchesMagic('webp', b)) return 'webp';
  return null;
}

async function handleMedia(ctx: Ctx, user: User, ev: LineEvent) {
  const m = ev.message!;
  if (!m.id) return;
  if (m.contentProvider?.type === 'external') {
    return send(ctx, [text('ไฟล์นี้ดึงจาก LINE ไม่ได้ ลองส่งใหม่อีกครั้งนะ')]);
  }
  const media: PendingMedia = {
    mid: m.id,
    kind: m.type ?? 'file',
    name: m.type === 'file' ? (m.fileName ?? null) : null,
    at: nowIso(),
  };

  const cutoff = new Date(now().getTime() - RECENT_MS).toISOString();
  const recent = await ctx.db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, user.id), eq(tasks.source, 'line'), gte(tasks.createdAt, cutoff)))
    .orderBy(desc(tasks.createdAt))
    .limit(1)
    .get();
  if (recent) return attachMedia(ctx, user, recent.id, media);

  const open = (await openTasks(ctx.db, user.id)).slice(0, 4);
  if (!open.length)
    return send(ctx, [text('ยังไม่มีงานให้แนบไฟล์ — สร้างงานก่อน แล้วส่งไฟล์ตามมาได้เลย')]);
  await upsertState(ctx.db, ctx.lineUserId, { pendingMedia: JSON.stringify(media) });
  return send(ctx, [
    text(
      'ต้องการแนบไฟล์นี้กับงานไหน?',
      open.map((t) => quickPostback(t.title, `a=att&id=${t.id}`)),
    ),
  ]);
}

async function attachMedia(ctx: Ctx, user: User, taskId: string, media: PendingMedia) {
  const { maxFileBytes } = limitsFrom(ctx.env);
  const { bytes, contentType } = await getMessageContent(ctx.env, media.mid, maxFileBytes);
  let name = media.name ? sanitizeFilename(media.name) : null;
  if (!name) {
    const ext = imageExt(new Uint8Array(bytes.slice(0, 16))) ?? 'bin';
    const p = bangkokParts(now());
    const stamp = `${p.year}${String(p.month).padStart(2, '0')}${String(p.day).padStart(2, '0')}-${String(p.hour).padStart(2, '0')}${String(p.minute).padStart(2, '0')}`;
    name = `line-${stamp}.${ext}`;
  }
  const [saved] = await saveUploads(ctx.db, ctx.env.FILES, ctx.env, user.id, taskId, [
    new File([bytes], name, { type: contentType }),
  ]);
  const task = await getOwned(ctx.db, user.id, taskId);
  return send(ctx, [
    text(
      `📎 แนบไฟล์ "${clip(saved!.filename, 50)}" เข้ากับงาน "${clip(task.title, 50)}" แล้ว\n🕒 ${whenText((await withTags(ctx.db, [task]))[0]!)}`,
    ),
  ]);
}

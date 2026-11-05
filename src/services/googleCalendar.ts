import { and, asc, eq, gt, isNotNull, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { getDb } from '../db/client';
import { categories, googleTokens, tasks, userSettings } from '../db/schema';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { addDays, now, nowIso, toBangkokIso } from '../lib/time';
import { IMPORTANCE_LABEL, URGENCY_LABEL } from '../lib/labels';
import { computeUrgency } from '../lib/urgency';
import type { Env } from '../types';
import { clip } from './flex';

export const SCOPE_CALENDAR = 'https://www.googleapis.com/auth/calendar.events';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/calendar/v3/calendars';
const TZ = 'Asia/Bangkok';
const NEEDS_RECONNECT = 'needs_reconnect';
/** Worker ฟรีจำกัด subrequest/query ต่อ invocation (~50): sync ทีละชุดเล็ก ๆ */
export const RESYNC_BATCH = 10;

type TaskRow = typeof tasks.$inferSelect;
type TokenRow = typeof googleTokens.$inferSelect;
export type SyncResult = 'created' | 'updated' | 'deleted' | 'skipped' | 'failed';

export const gcalConfigured = (env: Env): boolean =>
  !!(
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.GOOGLE_REDIRECT_URI &&
    env.TOKEN_ENC_KEY
  );

// ------------------------------------------------------------------ OAuth
export function connectUrl(env: Env, state: string): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', `openid email ${SCOPE_CALENDAR}`);
  u.searchParams.set('access_type', 'offline'); // ขอ refresh token
  u.searchParams.set('prompt', 'consent'); // บังคับให้ได้ refresh token ทุกครั้งที่เชื่อม
  u.searchParams.set('state', state);
  return u.toString();
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export async function exchangeCode(env: Env, code: string): Promise<TokenResponse | null> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  return res.ok ? ((await res.json()) as TokenResponse) : null;
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return ((await res.json()) as { email?: string }).email ?? null;
}

/** invalid_grant = ผู้ใช้เพิกถอนสิทธิ์/token หมดอายุ → ต้องเชื่อมใหม่ */
async function refreshAccessToken(
  env: Env,
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number } | 'invalid_grant' | null> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (res.ok) return (await res.json()) as { access_token: string; expires_in: number };
  if (res.status === 400 || res.status === 401) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (j.error === 'invalid_grant') return 'invalid_grant';
  }
  return null; // ปัญหาชั่วคราว (เครือข่าย/5xx)
}

export async function saveTokens(
  env: Env,
  db: Db,
  userId: string,
  t: {
    refreshToken: string;
    accessToken: string;
    expiresIn: number;
    scope: string;
    email: string | null;
  },
) {
  const values = {
    refreshTokenEnc: await encryptSecret(t.refreshToken, env.TOKEN_ENC_KEY, userId),
    accessTokenEnc: await encryptSecret(t.accessToken, env.TOKEN_ENC_KEY, userId),
    expiresAt: new Date(now().getTime() + t.expiresIn * 1000).toISOString(),
    scope: t.scope,
    email: t.email,
  };
  await db
    .insert(googleTokens)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: googleTokens.userId, set: values });
  await db
    .insert(userSettings)
    .values({ userId, gcalSyncEnabled: 1 })
    .onConflictDoUpdate({ target: userSettings.userId, set: { gcalSyncEnabled: 1 } });
}

export async function disconnectGoogle(env: Env, db: Db, userId: string): Promise<void> {
  const row = await db.select().from(googleTokens).where(eq(googleTokens.userId, userId)).get();
  if (row?.refreshTokenEnc) {
    try {
      const rt = await decryptSecret(row.refreshTokenEnc, env.TOKEN_ENC_KEY, userId);
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: rt }),
      });
    } catch {
      /* เพิกถอนที่ Google ไม่สำเร็จก็ไม่เป็นไร: เรายังลบ token ฝั่งเราเสมอ */
    }
  }
  await db.delete(googleTokens).where(eq(googleTokens.userId, userId));
  await db
    .insert(userSettings)
    .values({ userId, gcalSyncEnabled: 0 })
    .onConflictDoUpdate({ target: userSettings.userId, set: { gcalSyncEnabled: 0 } });
}

async function markNeedsReconnect(db: Db, userId: string) {
  await db
    .update(googleTokens)
    .set({ refreshTokenEnc: null, accessTokenEnc: null, expiresAt: null, scope: NEEDS_RECONNECT })
    .where(eq(googleTokens.userId, userId));
}

export async function gcalStatus(env: Env, db: Db, userId: string) {
  const [tok, settings] = await Promise.all([
    db.select().from(googleTokens).where(eq(googleTokens.userId, userId)).get(),
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).get(),
  ]);
  return {
    configured: gcalConfigured(env),
    connected: !!tok?.refreshTokenEnc,
    needsReconnect: tok?.scope === NEEDS_RECONNECT,
    email: tok?.email ?? null,
    syncEnabled: settings?.gcalSyncEnabled === 1,
    calendarId: settings?.gcalCalendarId ?? 'primary',
  };
}

// ------------------------------------------------------------------ API client
class GcalError extends Error {}

export interface SyncCtx {
  env: Env;
  db: Db;
  userId: string;
  calendarId: string;
  remindBefore: number;
  tok: TokenRow;
  access: string | null;
  accessExpiresAt: number;
  dead: boolean;
  cats?: Map<string, string>;
  reasons: Set<string>;
}

/** null = ไม่ต้องซิงก์ (ไม่ได้ตั้งค่า/ไม่ได้เชื่อม/ปิดซิงก์) */
export async function buildSyncCtx(env: Env, userId: string): Promise<SyncCtx | null> {
  if (!gcalConfigured(env)) return null;
  const db = getDb(env.DB);
  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();
  if (!settings || settings.gcalSyncEnabled !== 1) return null;
  const tok = await db.select().from(googleTokens).where(eq(googleTokens.userId, userId)).get();
  if (!tok?.refreshTokenEnc) return null;
  return {
    env,
    db,
    userId,
    calendarId: settings.gcalCalendarId || 'primary',
    remindBefore: settings.remindBeforeMinutes,
    tok,
    access: null,
    accessExpiresAt: 0,
    dead: false,
    reasons: new Set(),
  };
}

async function accessToken(ctx: SyncCtx, force = false): Promise<string | null> {
  if (ctx.dead) return null;
  const nowMs = now().getTime();
  if (!force && ctx.access && ctx.accessExpiresAt - nowMs > 60_000) return ctx.access;
  const { env, db, userId, tok } = ctx;
  try {
    if (
      !force &&
      tok.accessTokenEnc &&
      tok.expiresAt &&
      Date.parse(tok.expiresAt) - nowMs > 60_000
    ) {
      ctx.access = await decryptSecret(tok.accessTokenEnc, env.TOKEN_ENC_KEY, userId);
      ctx.accessExpiresAt = Date.parse(tok.expiresAt);
      return ctx.access;
    }
    const refresh = await decryptSecret(tok.refreshTokenEnc!, env.TOKEN_ENC_KEY, userId);
    const r = await refreshAccessToken(env, refresh);
    if (r === 'invalid_grant') {
      await markNeedsReconnect(db, userId);
      ctx.dead = true;
      return null;
    }
    if (!r) throw new GcalError('token refresh unavailable');
    const expiresAt = new Date(nowMs + r.expires_in * 1000).toISOString();
    await db
      .update(googleTokens)
      .set({
        accessTokenEnc: await encryptSecret(r.access_token, env.TOKEN_ENC_KEY, userId),
        expiresAt,
      })
      .where(eq(googleTokens.userId, userId));
    ctx.access = r.access_token;
    ctx.accessExpiresAt = Date.parse(expiresAt);
    return ctx.access;
  } catch (e) {
    if (e instanceof GcalError) throw e;
    // ถอดรหัสไม่ได้ (เช่นเปลี่ยน TOKEN_ENC_KEY): ให้เชื่อมใหม่
    console.error('gcal token unusable', e instanceof Error ? e.message : 'unknown');
    await markNeedsReconnect(db, userId);
    ctx.dead = true;
    return null;
  }
}

interface ApiResult {
  status: number;
  body: Record<string, unknown> | null;
}

async function api(ctx: SyncCtx, method: string, path: string, body?: unknown): Promise<ApiResult> {
  const url = `${API}/${encodeURIComponent(ctx.calendarId)}/events${path}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(ctx, attempt === 1); // 401 → refresh แล้วลองอีกครั้ง
    if (!token) throw new GcalError('not connected');
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && attempt === 0) continue;
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      json = null;
    }
    return { status: res.status, body: json };
  }
  throw new GcalError('unauthorized');
}

function noteFailure(ctx: SyncCtx, r: ApiResult) {
  const err = r.body?.error as { errors?: { reason?: string }[] } | undefined;
  const reason = err?.errors?.[0]?.reason ?? `http_${r.status}`;
  ctx.reasons.add(reason);
  console.error('gcal sync failed', r.status, reason); // ไม่ log เนื้อหางาน
}

// ------------------------------------------------------------------ task → event
const hhmmss = (dateTime: string) => dateTime.slice(11, 19).replace(/:/g, '');

/** event ของงาน; งานแม่ของซีรีส์จะใส่ EXDATE ของครั้งที่มีแถวจริงแล้ว (ซึ่งซิงก์เป็น event ของตัวเองแยกต่างหาก) */
export async function buildEvent(ctx: SyncCtx, t: TaskRow): Promise<Record<string, unknown>> {
  const ev = await buildEventBase(ctx, t);
  if (!t.recurrenceRule) return ev;
  const kids = await ctx.db
    .select({ d: tasks.recurrenceId })
    .from(tasks)
    .where(
      and(
        eq(tasks.parentTaskId, t.id),
        eq(tasks.userId, ctx.userId),
        isNotNull(tasks.recurrenceId),
      ),
    );
  const start = ev.start as { date?: string; dateTime?: string };
  const lines = kids.map((k) => {
    const d = k.d!.replace(/-/g, '');
    return start.dateTime
      ? `EXDATE;TZID=${TZ}:${d}T${hhmmss(start.dateTime)}`
      : `EXDATE;VALUE=DATE:${d}`;
  });
  return { ...ev, recurrence: [...(ev.recurrence as string[]), ...lines] };
}
const ok = (r: ApiResult) => r.status >= 200 && r.status < 300;
const hasWhen = (t: TaskRow) => !!(t.startAt || t.dueAt || t.dueDate);

function rrule(rule: string, allDay: boolean): string {
  // UNTIL=YYYYMMDD → สำหรับงานมีเวลาต้องเป็น UTC date-time (สิ้นวันตามเวลาไทย = 16:59:59Z)
  const fixed = allDay ? rule : rule.replace(/UNTIL=(\d{8})/, 'UNTIL=$1T165959Z');
  return `RRULE:${fixed}`;
}

async function categoryName(ctx: SyncCtx, id: string | null): Promise<string | null> {
  if (!id) return null;
  if (!ctx.cats) {
    const rows = await ctx.db.select().from(categories).where(eq(categories.userId, ctx.userId));
    ctx.cats = new Map(rows.map((c) => [c.id, c.name]));
  }
  return ctx.cats.get(id) ?? null;
}

async function buildEventBase(ctx: SyncCtx, t: TaskRow): Promise<Record<string, unknown>> {
  const base = ctx.env.APP_BASE_URL.replace(/\/$/, '');
  const cat = await categoryName(ctx, t.categoryId);
  const description = [
    t.description.slice(0, 6000),
    '— Dobby —',
    `เปิดงานนี้: ${base}/?task=${t.id}`,
    `ความเร่งด่วน: ${URGENCY_LABEL[computeUrgency(t, now())] ?? ''} · ความสำคัญ: ${IMPORTANCE_LABEL[t.importance] ?? t.importance}${cat ? ` · #${cat}` : ''}`,
    ...(t.startAt && t.dueAt
      ? [`เดดไลน์: ${toBangkokIso(new Date(t.dueAt)).slice(0, 16).replace('T', ' ')} น.`]
      : []),
  ]
    .filter((x) => x !== '')
    .join('\n');

  // งานแม่ของซีรีส์แทนทั้งซีรีส์: ✅/ยกเลิกของครั้งแรกไม่ควรกระทบทุกครั้งใน Google
  const done = t.status === 'done' && !t.recurrenceRule;
  const common = {
    description,
    extendedProperties: { private: { dobbyTaskId: t.id } },
    recurrence: t.recurrenceRule ? [rrule(t.recurrenceRule, t.allDay === 1)] : null,
  };
  const prefix = done ? '✅ ' : '';
  const popup = {
    useDefault: false,
    overrides: [{ method: 'popup', minutes: Math.min(ctx.remindBefore, 40320) }],
  };

  if (t.allDay === 1 && t.dueDate) {
    return {
      ...common,
      summary: clip(`${prefix}${t.title}`, 500),
      start: { date: t.dueDate, dateTime: null, timeZone: null },
      end: { date: addDays(t.dueDate, 1), dateTime: null, timeZone: null }, // end เป็น exclusive
      reminders: { useDefault: true },
    };
  }
  if (t.startAt) {
    const start = new Date(t.startAt);
    const end = t.endAt
      ? new Date(t.endAt)
      : new Date(start.getTime() + (t.estimateMinutes ?? 60) * 60_000);
    return {
      ...common,
      summary: clip(`${prefix}${t.title}`, 500),
      start: { dateTime: toBangkokIso(start), timeZone: TZ, date: null },
      end: { dateTime: toBangkokIso(end), timeZone: TZ, date: null },
      reminders: popup,
    };
  }
  // มีแต่เดดไลน์: บล็อก 30 นาทีที่จบตรงเวลาเดดไลน์ (เหมือนในเว็บ)
  const due = new Date(t.dueAt!);
  return {
    ...common,
    summary: clip(`${prefix}⏰ ${t.title}`, 500),
    start: {
      dateTime: toBangkokIso(new Date(due.getTime() - 30 * 60_000)),
      timeZone: TZ,
      date: null,
    },
    end: { dateTime: toBangkokIso(due), timeZone: TZ, date: null },
    reminders: popup,
  };
}

/** null มีความหมายเฉพาะตอน PATCH (ล้างค่าเดิม) ตอนสร้างใหม่ต้องไม่ส่ง */
function stripNulls(v: unknown): Record<string, unknown> {
  const clean = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(clean);
    if (x && typeof x === 'object') {
      return Object.fromEntries(
        Object.entries(x as Record<string, unknown>)
          .filter(([, val]) => val !== null)
          .map(([k, val]) => [k, clean(val)]),
      );
    }
    return x;
  };
  return clean(v) as Record<string, unknown>;
}

async function setEventId(ctx: SyncCtx, id: string, eventId: string | null) {
  await ctx.db
    .update(tasks)
    .set({ gcalEventId: eventId, gcalSyncedAt: eventId ? nowIso() : null })
    .where(and(eq(tasks.id, id), eq(tasks.userId, ctx.userId)));
}

async function deleteEvent(ctx: SyncCtx, eventId: string): Promise<boolean> {
  const r = await api(ctx, 'DELETE', `/${encodeURIComponent(eventId)}`);
  if (ok(r) || r.status === 404 || r.status === 410) return true; // ไม่มีอยู่แล้ว = สำเร็จ
  noteFailure(ctx, r);
  return false;
}

export async function syncRow(ctx: SyncCtx, t: TaskRow): Promise<SyncResult> {
  const wanted = t.gcalSync === 1 && (t.status !== 'cancelled' || !!t.recurrenceRule) && hasWhen(t);
  if (!wanted) {
    if (!t.gcalEventId) return 'skipped';
    if (!(await deleteEvent(ctx, t.gcalEventId))) return 'failed';
    await setEventId(ctx, t.id, null);
    return 'deleted';
  }
  const event = await buildEvent(ctx, t);
  if (t.gcalEventId) {
    const r = await api(ctx, 'PATCH', `/${encodeURIComponent(t.gcalEventId)}`, event);
    if (ok(r) && r.body?.status !== 'cancelled') {
      await setEventId(ctx, t.id, t.gcalEventId);
      return 'updated';
    }
    if (!ok(r) && r.status !== 404 && r.status !== 410) {
      noteFailure(ctx, r);
      return 'failed';
    }
    // event ถูกลบฝั่ง Google แล้ว → สร้างใหม่
  }
  const r = await api(ctx, 'POST', '', stripNulls(event));
  const id = r.body?.id;
  if (ok(r) && typeof id === 'string') {
    await setEventId(ctx, t.id, id);
    return 'created';
  }
  noteFailure(ctx, r);
  return 'failed';
}

// ------------------------------------------------------------------ entry points
/** ซิงก์งานหนึ่งชิ้น (best-effort: ไม่ throw เพื่อไม่ให้การแก้งานล้มเหลวเพราะ Google) */
export async function syncTaskSafe(env: Env, userId: string, taskId: string): Promise<SyncResult> {
  try {
    const ctx = await buildSyncCtx(env, userId);
    if (!ctx) return 'skipped';
    const row = await ctx.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .get();
    if (!row) return 'skipped';
    const res = await syncRow(ctx, row);
    if (row.parentTaskId && row.recurrenceId) {
      // ครั้งหนึ่งของซีรีส์เปลี่ยน → อัปเดต EXDATE ของงานแม่ (กันครั้งเดิมซ้ำใน Google)
      const parent = await ctx.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, row.parentTaskId), eq(tasks.userId, userId)))
        .get();
      if (parent) await syncRow(ctx, parent);
    }
    return res;
  } catch (e) {
    console.error('gcal sync error', e instanceof Error ? e.message : 'unknown');
    return 'failed';
  }
}

/** ลบ event หลังลบงาน */
export async function removeEventSafe(
  env: Env,
  userId: string,
  eventId: string | null,
): Promise<void> {
  if (!eventId) return;
  try {
    const ctx = await buildSyncCtx(env, userId);
    if (ctx) await deleteEvent(ctx, eventId);
  } catch (e) {
    console.error('gcal delete error', e instanceof Error ? e.message : 'unknown');
  }
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

/** sync ทั้งหมดใหม่ทีละชุด (cursor = id สุดท้ายของชุดก่อนหน้า) */
export async function resyncBatch(
  env: Env,
  userId: string,
  cursor: string | null,
): Promise<ResyncResult | null> {
  const ctx = await buildSyncCtx(env, userId);
  if (!ctx) return null;
  const rows = await ctx.db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        cursor ? gt(tasks.id, cursor) : undefined,
        or(
          isNotNull(tasks.startAt),
          isNotNull(tasks.dueAt),
          isNotNull(tasks.dueDate),
          isNotNull(tasks.gcalEventId),
        ),
      ),
    )
    .orderBy(asc(tasks.id))
    .limit(RESYNC_BATCH);
  const out: ResyncResult = {
    processed: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
    nextCursor: null,
    reasons: [],
  };
  for (const row of rows) {
    let r: SyncResult = 'failed';
    try {
      r = ctx.dead ? 'failed' : await syncRow(ctx, row);
    } catch (e) {
      console.error('gcal resync row error', e instanceof Error ? e.message : 'unknown');
    }
    out.processed++;
    out[r]++;
  }
  out.nextCursor = rows.length === RESYNC_BATCH ? rows[rows.length - 1]!.id : null;
  out.reasons = [...ctx.reasons];
  if (ctx.dead) out.reasons.push('needs_reconnect');
  return out;
}

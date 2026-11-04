/**
 * FullCalendar ถูกตั้ง timeZone='UTC' และเราป้อน "เวลาบนผนัง (Bangkok)" เข้าไปเอง
 * เพื่อให้แสดงเวลาไทยเสมอ ไม่ว่าเครื่องผู้ใช้จะอยู่เขตเวลาไหน
 */
const OFFSET_MS = 7 * 60 * 60 * 1000;

/** ISO UTC → 'YYYY-MM-DDTHH:mm:ss' (เวลาไทย) */
export const isoToWall = (iso: string): string =>
  new Date(Date.parse(iso) + OFFSET_MS).toISOString().slice(0, 19);

/** 'YYYY-MM-DDTHH:mm' (เวลาไทย) → ISO UTC */
export const wallToIso = (wall: string): string =>
  new Date(Date.parse(wall.length === 16 ? `${wall}:00Z` : `${wall}Z`) - OFFSET_MS).toISOString();

/** Date จาก FullCalendar (UTC-coerced) → ISO UTC จริง */
export const calDateToIso = (d: Date): string => new Date(d.getTime() - OFFSET_MS).toISOString();

export const calDateToYmd = (d: Date): string => d.toISOString().slice(0, 10);

/** 'now' แบบเวลาบนผนังไทย สำหรับ FullCalendar */
export const wallNow = (): Date => new Date(Date.now() + OFFSET_MS);

/** input[type=datetime-local] value จาก ISO */
export const isoToInput = (iso: string | null): string => (iso ? isoToWall(iso).slice(0, 16) : '');
export const inputToIso = (v: string): string | null => (v ? wallToIso(v) : null);

export const addMinutesWall = (wall: string, minutes: number): string =>
  new Date(Date.parse(`${wall}Z`) + minutes * 60_000).toISOString().slice(0, 19);

export const todayYmd = (): string => wallNow().toISOString().slice(0, 10);

export function formatTimeRange(t: {
  allDay: boolean;
  startAt: string | null;
  endAt: string | null;
  dueAt: string | null;
}): string {
  const hm = (iso: string) => isoToWall(iso).slice(11, 16);
  if (t.allDay) return 'ทั้งวัน';
  if (t.startAt) return t.endAt ? `${hm(t.startAt)}–${hm(t.endAt)}` : hm(t.startAt);
  if (t.dueAt) return `ภายใน ${hm(t.dueAt)}`;
  return '';
}

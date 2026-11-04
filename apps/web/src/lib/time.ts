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
  // เริ่ม = จบ ถือเป็นจุดเวลา (แสดงเวลาเดียว ไม่ใช่ "16:37–16:37")
  if (t.startAt)
    return t.endAt && hm(t.endAt) !== hm(t.startAt)
      ? `${hm(t.startAt)}–${hm(t.endAt)}`
      : hm(t.startAt);
  if (t.dueAt) return `ภายใน ${hm(t.dueAt)}`;
  return '';
}

/** งานที่ไม่มีช่วงเวลาจริง (ไม่มีจบ หรือจบ = เริ่ม) = จุดเวลา/เดดไลน์ ไม่ใช่บล็อก */
export const isPointInTime = (t: {
  startAt: string | null;
  endAt: string | null;
  estimateMinutes: number | null;
}): boolean => !!t.startAt && (t.endAt ? t.endAt === t.startAt : !t.estimateMinutes);

export interface TimeLeft {
  text: string;
  overdue: boolean;
  /** ใกล้ถึง (≤ 24 ชม.) หรือเลยแล้ว: ใช้เน้นสี */
  urgent: boolean;
}

/** เวลาที่เหลือถึงเดดไลน์ (เดดไลน์ทั้งวัน = สิ้นสุดวันนั้นเวลาไทย); null ถ้าไม่มีเดดไลน์หรือเสร็จ/ยกเลิกแล้ว */
export function timeLeft(
  t: { dueAt: string | null; dueDate: string | null; status: string },
  nowMs: number = Date.now(),
): TimeLeft | null {
  if (t.status === 'done' || t.status === 'cancelled') return null;
  const due = t.dueAt
    ? Date.parse(t.dueAt)
    : t.dueDate
      ? Date.parse(`${t.dueDate}T23:59:00+07:00`)
      : NaN;
  if (Number.isNaN(due)) return null;
  const diff = due - nowMs;
  const abs = Math.abs(diff);
  const min = Math.max(1, Math.round(abs / 60_000));
  const span =
    min < 60
      ? `${min} นาที`
      : min < 24 * 60
        ? `${Math.round(min / 60)} ชม.`
        : `${Math.round(min / 1440)} วัน`;
  return diff < 0
    ? { text: `เลยมา ${span}`, overdue: true, urgent: true }
    : { text: `อีก ${span}`, overdue: false, urgent: diff <= 24 * 60 * 60_000 };
}

import { addDays, bangkokDate, bangkokHm } from '../lib/time';

/**
 * Thai natural-language task parser (rule-based).
 * ดึงวัน/เวลา/เดดไลน์/ธง/ประเภท/แท็ก/ระยะเวลา/ทำซ้ำ ออกจากข้อความ แล้วเหลือส่วนที่เป็น title
 */

export interface ParseCategory {
  id: string;
  name: string;
}

export interface ParsedTask {
  title: string;
  /** วันที่เริ่ม YYYY-MM-DD (เวลาไทย) */
  date?: string;
  /** HH:mm */
  time?: string;
  endTime?: string;
  due?: { date: string; time?: string };
  /** ข้อความหลัง # (ตามที่พิมพ์) */
  category?: string;
  /** id ของ category ที่ fuzzy-match เจอ */
  categoryId?: string;
  urgency?: number;
  importance?: number;
  tags: string[];
  estimateMinutes?: number;
  /** RRULE subset เช่น FREQ=WEEKLY;BYDAY=MO */
  recurrence?: string;
  confidence: number;
  /** ผู้ใช้ใส่ !ok เพื่อข้ามการถามยืนยัน */
  confirmed: boolean;
  /** พิมพ์คำว่า "วันหลัง/สักวัน/ไว้ทีหลัง" = ไม่เร่ง ไม่ต้องกำหนดวัน (Quick Add ส่งไป "ยังไม่จัดเวลา") */
  someday?: boolean;
  /** มีค่าเมื่อ parse ได้วัน/เวลาที่ผ่านมาแล้ว — ให้ถามยืนยันแทนการเดา */
  needsConfirm?: {
    reason: 'past_date' | 'past_time';
    dateRaw: string | null;
    date: string;
    explicitYear: boolean;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (h: number, m = 0) => `${pad(h)}:${pad(m)}`;

const NUM_WORDS: Record<string, number> = {
  หนึ่ง: 1,
  เอ็ด: 1,
  สอง: 2,
  สาม: 3,
  สี่: 4,
  ห้า: 5,
  หก: 6,
  เจ็ด: 7,
  แปด: 8,
  เก้า: 9,
  สิบ: 10,
  สิบเอ็ด: 11,
  สิบสอง: 12,
};
const NUM = '\\d{1,2}|สิบเอ็ด|สิบสอง|หนึ่ง|เอ็ด|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ';
const toNum = (s: string): number => (/^\d/.test(s) ? Number(s) : (NUM_WORDS[s] ?? NaN));

const MONTHS: [string, number][] = [
  ['มกราคม', 1],
  ['กุมภาพันธ์', 2],
  ['มีนาคม', 3],
  ['เมษายน', 4],
  ['พฤษภาคม', 5],
  ['มิถุนายน', 6],
  ['กรกฎาคม', 7],
  ['สิงหาคม', 8],
  ['กันยายน', 9],
  ['ตุลาคม', 10],
  ['พฤศจิกายน', 11],
  ['ธันวาคม', 12],
  ['มค', 1],
  ['กพ', 2],
  ['มีค', 3],
  ['เมย', 4],
  ['พค', 5],
  ['มิย', 6],
  ['กค', 7],
  ['สค', 8],
  ['กย', 9],
  ['ตค', 10],
  ['พย', 11],
  ['ธค', 12],
];
export const MONTH_SHORT = [
  '',
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];
const monthOf = (raw: string): number => {
  const k = raw.replace(/\./g, '');
  return MONTHS.find(([n]) => n === k)?.[1] ?? NaN;
};
// ชื่อเต็มก่อน แล้วตัวย่อ (จุดเป็น optional)
const MONTH_RE =
  '(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|ม\\.ค\\.?|ก\\.พ\\.?|มี\\.ค\\.?|เม\\.ย\\.?|พ\\.ค\\.?|มิ\\.ย\\.?|ก\\.ค\\.?|ส\\.ค\\.?|ก\\.ย\\.?|ต\\.ค\\.?|พ\\.ย\\.?|ธ\\.ค\\.?)';

const WEEKDAYS: Record<string, number> = {
  อาทิตย์: 0,
  จันทร์: 1,
  อังคาร: 2,
  พุธ: 3,
  พฤหัสบดี: 4,
  พฤหัส: 4,
  ศุกร์: 5,
  เสาร์: 6,
};
const WD_RE = '(จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์)';
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const DEADLINE_RE = /(?:เดดไลน์|เดทไลน์|deadline|due|ส่งภายใน|ภายใน|ก่อน)[\s:]*$/i;
const TRAIL_RE = /(?:^|\s)(?:เวลา|ตอน|ใน|ที่|วัน|เมื่อ)\s*$/;
const LEAD_RE = /^\s*(?:เวลา|ตอน|ใน|ที่|วัน|เมื่อ)(?:\s|$)/;

interface Span {
  start: number;
  end: number;
}
const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;
const blank = (s: string, a: number, b: number) => s.slice(0, a) + ' '.repeat(b - a) + s.slice(b);

// ---------- date helpers (ทั้งหมดเป็น YYYY-MM-DD เวลาไทย) ----------
const ymdParts = (d: string) => d.split('-').map(Number) as [number, number, number];
const weekdayOf = (d: string): number => {
  const [y, m, dd] = ymdParts(d);
  return new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
};
const mondayOf = (d: string): string => addDays(d, -((weekdayOf(d) + 6) % 7));
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const toCe = (y: number) => (y > 2400 ? y - 543 : y < 100 ? 2000 + y : y);
const mkDate = (y: number, m: number, d: number): string | null =>
  m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m) ? `${y}-${pad(m)}-${pad(d)}` : null;

interface DateHit extends Span {
  value: string;
  raw: string;
  explicitYear: boolean;
  marked?: boolean;
}
interface TimeHit extends Span {
  time: string;
  endTime?: string;
  marked?: boolean;
}

function findTimes(w: string): TimeHit[] {
  const hits: TimeHit[] = [];
  const add = (start: number, end: number, time: string, endTime?: string) => {
    const s = { start, end };
    if (!hits.some((h) => overlaps(h, s))) hits.push({ ...s, time, endTime });
  };
  const validHm = (h: number, m: number) => h >= 0 && h <= 23 && m >= 0 && m <= 59;
  const NSUF = '(?:\\s*น\\.?(?![ก-๛]))?';

  // 1) ช่วงเวลา 14:00-15:30
  for (const m of w.matchAll(
    new RegExp(
      `(?:เวลา\\s*)?(\\d{1,2})[:.](\\d{2})${NSUF}\\s*(?:-|–|—|ถึง)\\s*(\\d{1,2})[:.](\\d{2})${NSUF}`,
      'g',
    ),
  )) {
    const [h1, m1, h2, m2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (validHm(h1, m1) && validHm(h2, m2))
      add(m.index!, m.index! + m[0].length, hm(h1, m1), hm(h2, m2));
  }
  // 2) เที่ยงคืน / เที่ยง
  for (const m of w.matchAll(/เที่ยงคืน|เที่ยง(?:วัน)?/g)) {
    add(m.index!, m.index! + m[0].length, m[0] === 'เที่ยงคืน' ? '00:00' : '12:00');
  }
  // 3) ตี N
  for (const m of w.matchAll(new RegExp(`ตี\\s*(${NUM})(?:\\s*(ครึ่ง))?`, 'g'))) {
    const n = toNum(m[1]!);
    if (n >= 1 && n <= 6) add(m.index!, m.index! + m[0].length, hm(n, m[2] ? 30 : 0));
  }
  // 4) บ่าย N (โมง) / บ่ายโมง
  for (const m of w.matchAll(
    new RegExp(`บ่าย(?:\\s*(${NUM})\\s*(?:โมง)?|\\s*โมง)(?:\\s*(ครึ่ง))?`, 'g'),
  )) {
    const n = m[1] ? toNum(m[1]) : 1;
    if (n >= 1 && n <= 11) add(m.index!, m.index! + m[0].length, hm(n + 12, m[2] ? 30 : 0));
  }
  // 5) เย็น N (โมง)
  for (const m of w.matchAll(new RegExp(`เย็น\\s*(${NUM})\\s*(?:โมง)?(?:\\s*(ครึ่ง))?`, 'g'))) {
    const n = toNum(m[1]!);
    if (n >= 1 && n <= 11) add(m.index!, m.index! + m[0].length, hm(n + 12, m[2] ? 30 : 0));
  }
  // 6) N โมง (เช้า|เย็น)  — ระบบ 6 ชั่วโมงแบบไทย: 2 โมงเช้า = 08:00
  for (const m of w.matchAll(
    new RegExp(`(?<![\\d:.])(${NUM})\\s*โมง\\s*(เช้า|เย็น)?(?:\\s*(ครึ่ง))?`, 'g'),
  )) {
    const n = toNum(m[1]!);
    const q = m[2];
    let h = NaN;
    if (q === 'เช้า') h = n >= 1 && n <= 5 ? n + 6 : n >= 6 && n <= 11 ? n : NaN;
    else if (q === 'เย็น') h = n >= 1 && n <= 11 ? n + 12 : NaN;
    else h = n >= 1 && n <= 5 ? n + 12 : n >= 6 && n <= 12 ? n : NaN;
    if (!Number.isNaN(h)) add(m.index!, m.index! + m[0].length, hm(h, m[3] ? 30 : 0));
  }
  // 7) N ทุ่ม
  for (const m of w.matchAll(new RegExp(`(${NUM})\\s*ทุ่ม(?:\\s*(ครึ่ง))?`, 'g'))) {
    const n = toNum(m[1]!);
    if (n >= 1 && n <= 6)
      add(m.index!, m.index! + m[0].length, hm(n === 6 ? 0 : n + 18, m[2] ? 30 : 0));
  }
  // 8) 14:00 / 14.30 (+ น.)
  for (const m of w.matchAll(
    new RegExp(
      `(?:เวลา\\s*)?(?<![\\d:./])(\\d{1,2})[:.](\\d{2})(?![\\d])${NSUF}(?!\\s*(?:บาท|%|ชม|นาที))`,
      'g',
    ),
  )) {
    const [h, mi] = [Number(m[1]), Number(m[2])];
    if (validHm(h, mi)) add(m.index!, m.index! + m[0].length, hm(h, mi));
  }
  // 9) 14 น. / 14 นาฬิกา
  for (const m of w.matchAll(/(?:เวลา\s*)?(?<![\d:./])(\d{1,2})\s*(?:น\.(?![ก-๛])|นาฬิกา)/g)) {
    const h = Number(m[1]);
    if (h >= 0 && h <= 23) add(m.index!, m.index! + m[0].length, hm(h));
  }
  return hits.sort((a, b) => a.start - b.start);
}

function findDates(w: string, today: string): DateHit[] {
  const hits: DateHit[] = [];
  const [ty] = ymdParts(today);
  const add = (start: number, end: number, value: string | null, explicitYear = false) => {
    if (!value) return;
    const s = { start, end };
    if (!hits.some((h) => overlaps(h, s)))
      hits.push({ ...s, value, raw: w.slice(start, end), explicitYear });
  };

  // 1) 15 พ.ย. [2569]
  for (const m of w.matchAll(
    new RegExp(`(?:วันที่\\s*)?(\\d{1,2})\\s*${MONTH_RE}(?:\\s*(\\d{4}))?(?![\\d])`, 'g'),
  )) {
    const mo = monthOf(m[2]!);
    const y = m[3] ? toCe(Number(m[3])) : ty;
    add(m.index!, m.index! + m[0].length, mkDate(y, mo, Number(m[1])), !!m[3]);
  }
  // 2) 15/11[/2569]
  for (const m of w.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])/g)) {
    const y = m[3] ? toCe(Number(m[3])) : ty;
    add(m.index!, m.index! + m[0].length, mkDate(y, Number(m[2]), Number(m[1])), !!m[3]);
  }
  // 3) อีก N วัน/สัปดาห์
  for (const m of w.matchAll(/อีก\s*(\d+)\s*(วัน|สัปดาห์|อาทิตย์)(?:\s*ข้างหน้า)?/g)) {
    const n = Number(m[1]) * (m[2] === 'วัน' ? 1 : 7);
    if (n > 0 && n <= 3650) add(m.index!, m.index! + m[0].length, addDays(today, n));
  }
  // 4) วันนี้ / พรุ่งนี้ / มะรืน(นี้)
  for (const m of w.matchAll(/มะรืนนี้|มะรืน|พรุ่งนี้|วันนี้/g)) {
    const off = m[0] === 'วันนี้' ? 0 : m[0] === 'พรุ่งนี้' ? 1 : 2;
    add(m.index!, m.index! + m[0].length, addDays(today, off));
  }
  // 5) สิ้นเดือน
  for (const m of w.matchAll(/สิ้นเดือน(?:นี้)?/g)) {
    const [y, mo] = ymdParts(today);
    add(m.index!, m.index! + m[0].length, mkDate(y, mo, daysInMonth(y, mo)));
  }
  // 6) สัปดาห์หน้า / อาทิตย์หน้า (ไม่ใช่ "วันอาทิตย์หน้า") = วันจันทร์ของสัปดาห์ถัดไป
  for (const m of w.matchAll(/สัปดาห์หน้า|(?<!วัน)อาทิตย์หน้า/g)) {
    add(m.index!, m.index! + m[0].length, addDays(mondayOf(today), 7));
  }
  // 7) วันจันทร์ … / จันทร์หน้า
  for (const m of w.matchAll(new RegExp(`(?:วัน)?${WD_RE}(?:\\s*(หน้า))?`, 'g'))) {
    const target = WEEKDAYS[m[1]!]!;
    const value = m[2]
      ? addDays(mondayOf(today), 7 + ((target + 6) % 7))
      : addDays(today, (target - weekdayOf(today) + 7) % 7);
    add(m.index!, m.index! + m[0].length, value);
  }
  return hits.sort((a, b) => a.start - b.start);
}

function matchCategory(raw: string, cats: ParseCategory[]): string | undefined {
  const q = raw.toLowerCase();
  const n = (c: ParseCategory) => c.name.toLowerCase();
  return (
    cats.find((c) => n(c) === q) ??
    cats.find((c) => n(c).startsWith(q)) ??
    cats.find((c) => q.length >= 2 && (n(c).includes(q) || q.includes(n(c))))
  )?.id;
}

export function parseTask(input: string, now: Date, categories: ParseCategory[] = []): ParsedTask {
  const today = bangkokDate(now);
  const nowHm = bangkokHm(now);
  let w = input.normalize('NFC');
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    for (const m of [...w.matchAll(re)]) {
      fn(m);
      w = blank(w, m.index!, m.index! + m[0].length);
    }
  };

  let urgency: number | undefined;
  let importance: number | undefined;
  let confirmed = false;
  take(/!(ด่วนมาก|ด่วน|สำคัญมาก|สำคัญ|[uU][1-4]|[pP][1-4]|ok|OK|ยืนยัน)/g, (m) => {
    const f = m[1]!.toLowerCase();
    if (f === 'ด่วนมาก') urgency = 4;
    else if (f === 'ด่วน') urgency = 3;
    else if (f === 'สำคัญมาก') importance = 4;
    else if (f === 'สำคัญ') importance = 3;
    else if (f[0] === 'u') urgency = Number(f[1]);
    else if (f[0] === 'p') importance = Number(f[1]);
    else confirmed = true; // ok / ยืนยัน
  });

  let category: string | undefined;
  let categoryId: string | undefined;
  const tags: string[] = [];
  take(/#([^\s#@!]+)/g, (m) => {
    if (category) return;
    category = m[1]!;
    categoryId = matchCategory(category, categories);
    if (!categoryId) tags.push(category); // ไม่เจอประเภทนี้ → เก็บเป็นแท็กแทน
  });
  take(/@([^\s#@!]+)/g, (m) => {
    if (!tags.includes(m[1]!)) tags.push(m[1]!);
  });

  // ไม่เร่ง: วันหลัง / สักวัน / ไว้ทีหลัง
  let someday = false;
  take(/วันหลัง|สักวัน|ไว้ทีหลัง/g, () => (someday = true));

  // ทำซ้ำ (weekday ก่อน "ทุกวัน")
  let recurrence: string | undefined;
  let recurDay: number | undefined;
  take(new RegExp(`ทุก(?:วัน)?${WD_RE}`, 'g'), (m) => {
    recurDay = WEEKDAYS[m[1]!]!;
    recurrence ??= `FREQ=WEEKLY;BYDAY=${BYDAY[recurDay]}`;
  });
  take(/ทุกสัปดาห์|ทุกอาทิตย์/g, () => (recurrence ??= 'FREQ=WEEKLY'));
  take(/ทุกเดือน/g, () => (recurrence ??= 'FREQ=MONTHLY'));
  take(/ทุกวัน(?!ที่)/g, () => (recurrence ??= 'FREQ=DAILY'));

  // ระยะเวลา
  let estimate = 0;
  take(/ครึ่ง\s*(?:ชั่วโมง|ชม\.?)/g, () => (estimate += 30));
  take(/(\d+(?:\.\d+)?)\s*(ชั่วโมง|ชม\.?|นาที)/g, (m) => {
    estimate += Math.round(Number(m[1]) * (m[2] === 'นาที' ? 1 : 60));
  });

  // เวลา + วัน (หาจาก w; วันหาหลังตัดช่วงเวลาออกเพื่อไม่ให้ชนกัน)
  const times = findTimes(w);
  let wd = w;
  for (const t of times) wd = blank(wd, t.start, t.end);
  const dates = findDates(wd, today);

  // คำบอกเดดไลน์ที่อยู่ติดหน้า วัน/เวลา
  const markerSpans: Span[] = [];
  const markBefore = (h: Span & { marked?: boolean }) => {
    const m = DEADLINE_RE.exec(w.slice(0, h.start));
    if (m) {
      h.marked = true;
      markerSpans.push({ start: m.index, end: m.index + m[0].length });
    }
  };
  dates.forEach(markBefore);
  times.forEach(markBefore);
  // เวลาที่ตามหลังวันที่ถูก mark ทันที ("เดดไลน์ ศุกร์ 17:00") ถือเป็นเดดไลน์ด้วย
  for (const t of times) {
    if (t.marked) continue;
    const prev = dates.find((d) => d.marked && /^\s*$/.test(w.slice(d.end, t.start)));
    if (prev) t.marked = true;
  }
  for (const s of markerSpans) w = blank(w, s.start, s.end);
  for (const t of times) w = blank(w, t.start, t.end);
  for (const d of dates) w = blank(w, d.start, d.end);

  const mDates = dates.filter((d) => d.marked);
  const uDates = dates.filter((d) => !d.marked);
  const mTimes = times.filter((t) => t.marked);
  const uTimes = times.filter((t) => !t.marked);
  let startDate = uDates[0];
  const startTime = uTimes[0];
  let due: ParsedTask['due'];
  let dueRaw: DateHit | undefined = mDates[0];
  if (mDates.length || mTimes.length) {
    let dueDate = mDates[0]?.value;
    if (!dueDate) {
      dueDate = startDate?.value ?? today;
      dueRaw = startDate;
      if (!startTime) startDate = undefined; // วันที่ถูกใช้เป็นวันของเดดไลน์
    }
    due = { date: dueDate, time: mTimes[0]?.time };
  }

  let date = startDate?.value;
  if (recurrence && !date) {
    // งานทำซ้ำที่ไม่ระบุวัน: เริ่มจากวันที่ตรงกับวันในสัปดาห์ที่ระบุ (หรือวันนี้)
    date = recurDay === undefined ? today : addDays(today, (recurDay - weekdayOf(today) + 7) % 7);
  } else if (startTime && !date) {
    date = today;
  }

  // ผ่านมาแล้ว? (งานทำซ้ำไม่ถาม)
  let needsConfirm: ParsedTask['needsConfirm'];
  if (!confirmed && !recurrence) {
    const check = (d: string | undefined, t: string | undefined, hit: DateHit | undefined) => {
      if (needsConfirm || !d) return;
      if (d < today) {
        needsConfirm = {
          reason: 'past_date',
          dateRaw: hit?.raw ?? null,
          date: d,
          explicitYear: !!hit?.explicitYear,
        };
      } else if (d === today && t && t < nowHm) {
        needsConfirm = {
          reason: 'past_time',
          dateRaw: hit?.raw ?? null,
          date: d,
          explicitYear: false,
        };
      }
    };
    check(date, startTime?.time, startDate);
    check(due?.date, due?.time, dueRaw);
  }

  let title = w.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    title = title.replace(TRAIL_RE, '').replace(LEAD_RE, '').trim();
  }
  title = title.replace(/^[\s,:;\-–—]+|[\s,:;\-–—]+$/g, '').trim();
  // "สำคัญ"/⭐ ที่อยู่เป็นคำเดี่ยว ๆ ท้ายหรือหน้าข้อความ = ติ๊กสำคัญ (ไม่ต้องใส่ !) ; คำว่า "สำคัญ" ที่เป็นส่วนของชื่อ เช่น "ประชุมสำคัญ" ไม่ถูกตัด
  const imp = /(?:^|\s)(สำคัญมาก|สำคัญ|⭐)$|^(⭐)\s+/u.exec(title);
  if (imp && title.replace(imp[0], '').trim()) {
    if (importance === undefined) importance = imp[1] === 'สำคัญมาก' ? 4 : 3;
    title = title.replace(imp[0], ' ').replace(/\s+/g, ' ').trim();
  }

  const hasWhen = !!(date || due || recurrence);
  const confidence = Math.min(
    1,
    (title ? 0.6 : 0.2) + (hasWhen ? 0.3 : 0) + (title.length >= 3 ? 0.1 : 0),
  );

  return {
    title,
    date,
    time: startTime?.time,
    endTime: startTime?.endTime,
    due,
    category,
    categoryId,
    urgency,
    importance,
    tags,
    estimateMinutes: estimate > 0 ? estimate : undefined,
    recurrence,
    confidence,
    confirmed,
    needsConfirm,
    ...(someday ? { someday } : {}),
  };
}

/** ตัวเลือกให้ผู้ใช้กดเมื่อ parse ได้วัน/เวลาที่ผ่านมาแล้ว (ส่งกลับเป็นข้อความใหม่ จึงไม่ต้องเก็บ state) */
export function confirmAlternatives(
  original: string,
  p: ParsedTask,
): { label: string; text: string }[] {
  const nc = p.needsConfirm;
  if (!nc) return [];
  const out: { label: string; text: string }[] = [];
  const replaceRaw = (to: string) =>
    nc.dateRaw && original.includes(nc.dateRaw.trim())
      ? original.replace(nc.dateRaw.trim(), to)
      : `${original} ${to}`;
  if (nc.reason === 'past_time') {
    out.push({ label: 'เลื่อนเป็นพรุ่งนี้', text: replaceRaw('พรุ่งนี้') });
  } else if (!nc.explicitYear) {
    const [y, m, d] = ymdParts(nc.date);
    out.push({
      label: `ใช้ปี ${y + 1 + 543}`,
      text: replaceRaw(`${d} ${MONTH_SHORT[m]} ${y + 1 + 543}`),
    });
  }
  out.push({ label: 'บันทึกตามเดิม', text: `${original} !ok` });
  return out;
}

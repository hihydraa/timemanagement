import { describe, expect, it } from 'vitest';
import {
  isOccurrence,
  MAX_OCCURRENCES,
  occurrences,
  parseRule,
  type Rule,
} from '../src/services/recurrence';

const R = (s: string): Rule => {
  const r = parseRule(s);
  if (!r) throw new Error(`bad rule ${s}`);
  return r;
};
const occ = (rule: string, anchor: string, from: string, to: string, cap?: number) =>
  occurrences(R(rule), anchor, from, to, cap);

describe('parseRule', () => {
  it('อ่านกฎที่ถูกต้อง', () => {
    expect(R('FREQ=DAILY')).toEqual({ freq: 'DAILY', interval: 1, byday: [], until: null });
    expect(R('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;UNTIL=20261231')).toEqual({
      freq: 'WEEKLY',
      interval: 2,
      byday: [1, 5],
      until: '2026-12-31',
    });
    expect(R('FREQ=MONTHLY;INTERVAL=3').interval).toBe(3);
    expect(R('FREQ=WEEKLY;BYDAY=SU,SU').byday).toEqual([0]); // ซ้ำ → รวม
  });
  it.each([
    '',
    'FREQ=YEARLY',
    'FREQ=HOURLY',
    'INTERVAL=2',
    'FREQ=DAILY;INTERVAL=0',
    'FREQ=DAILY;INTERVAL=100',
    'FREQ=DAILY;INTERVAL=1.5',
    'FREQ=WEEKLY;BYDAY=XX',
    'FREQ=WEEKLY;BYDAY=1MO',
    'FREQ=DAILY;UNTIL=2026',
    'FREQ=DAILY;UNTIL=2026-12-31',
    'FREQ=DAILY;;',
    'FREQ',
    'garbage',
  ])('ปฏิเสธกฎที่ไม่ถูกต้อง %j', (s) => expect(parseRule(s)).toBeNull());
  it('null/undefined → null', () => {
    expect(parseRule(null)).toBeNull();
    expect(parseRule(undefined)).toBeNull();
  });
});

describe('occurrences: รายวัน', () => {
  it('ไม่รวม anchor และรวมขอบช่วง', () => {
    expect(occ('FREQ=DAILY', '2026-11-02', '2026-11-02', '2026-11-06')).toEqual([
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ]);
    expect(occ('FREQ=DAILY', '2026-11-02', '2026-11-05', '2026-11-05')).toEqual(['2026-11-05']);
  });
  it('ช่วงเริ่มก่อน anchor ก็ไม่ย้อนไปก่อน anchor', () => {
    expect(occ('FREQ=DAILY', '2026-11-10', '2026-10-01', '2026-11-12')).toEqual([
      '2026-11-11',
      '2026-11-12',
    ]);
    expect(occ('FREQ=DAILY', '2026-11-10', '2026-10-01', '2026-11-09')).toEqual([]);
  });
  it('INTERVAL และการเริ่มกลางช่วงยังตรงรอบเดิม', () => {
    expect(occ('FREQ=DAILY;INTERVAL=3', '2026-11-02', '2026-11-02', '2026-11-12')).toEqual([
      '2026-11-05',
      '2026-11-08',
      '2026-11-11',
    ]);
    expect(occ('FREQ=DAILY;INTERVAL=3', '2026-11-02', '2026-11-10', '2026-11-14')).toEqual([
      '2026-11-11',
      '2026-11-14',
    ]);
  });
  it('UNTIL รวมวันนั้น, ข้ามเดือน/ปี', () => {
    expect(occ('FREQ=DAILY;UNTIL=20261105', '2026-11-02', '2026-11-01', '2026-12-01')).toEqual([
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
    ]);
    expect(occ('FREQ=DAILY', '2026-12-30', '2026-12-30', '2027-01-02')).toEqual([
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });
  it('เพดานจำนวนครั้ง', () => {
    const all = occ('FREQ=DAILY', '2026-01-01', '2026-01-01', '2030-01-01');
    expect(all).toHaveLength(MAX_OCCURRENCES);
    expect(all[0]).toBe('2026-01-02');
    expect(occ('FREQ=DAILY', '2026-01-01', '2026-01-01', '2030-01-01', 5)).toHaveLength(5);
  });
});

describe('occurrences: รายสัปดาห์', () => {
  it('ค่าเริ่มต้น = วันเดียวกับ anchor', () => {
    expect(occ('FREQ=WEEKLY', '2026-11-02', '2026-11-02', '2026-11-30')).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
  });
  it('หลายวันในสัปดาห์ (BYDAY)', () => {
    expect(occ('FREQ=WEEKLY;BYDAY=MO,WE,FR', '2026-11-02', '2026-11-02', '2026-11-13')).toEqual([
      '2026-11-04',
      '2026-11-06',
      '2026-11-09',
      '2026-11-11',
      '2026-11-13',
    ]);
  });
  it('INTERVAL=2 ตรงรอบจาก anchor แม้เริ่มดูกลางช่วง', () => {
    expect(
      occ('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', '2026-11-02', '2026-11-02', '2026-12-14'),
    ).toEqual(['2026-11-16', '2026-11-30', '2026-12-14']);
    expect(
      occ('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', '2026-11-02', '2026-11-20', '2026-12-20'),
    ).toEqual(['2026-11-30', '2026-12-14']);
  });
  it('anchor กลางสัปดาห์: วันก่อน anchor ในสัปดาห์เดียวกันไม่นับ', () => {
    expect(occ('FREQ=WEEKLY;BYDAY=MO,TU', '2026-11-04', '2026-11-04', '2026-11-12')).toEqual([
      '2026-11-09',
      '2026-11-10',
    ]);
  });
  it('วันอาทิตย์เป็นวันสุดท้ายของสัปดาห์ (สัปดาห์เริ่มวันจันทร์)', () => {
    expect(occ('FREQ=WEEKLY;BYDAY=SU', '2026-11-01', '2026-11-01', '2026-11-16')).toEqual([
      '2026-11-08',
      '2026-11-15',
    ]);
  });
  it('ข้ามปี', () => {
    expect(occ('FREQ=WEEKLY', '2026-12-28', '2026-12-28', '2027-01-12')).toEqual([
      '2027-01-04',
      '2027-01-11',
    ]);
  });
});

describe('occurrences: รายเดือน', () => {
  it('วันที่ 31 ข้ามเดือนที่ไม่มี 31', () => {
    expect(occ('FREQ=MONTHLY', '2026-01-31', '2026-02-01', '2026-06-30')).toEqual([
      '2026-03-31',
      '2026-05-31',
    ]);
  });
  it('INTERVAL เป็นเดือน', () => {
    expect(occ('FREQ=MONTHLY;INTERVAL=2', '2026-11-15', '2026-11-16', '2027-04-01')).toEqual([
      '2027-01-15',
      '2027-03-15',
    ]);
  });
  it('29 กุมภาพันธ์: ข้ามเดือน ก.พ. ของปีที่ไม่ใช่อธิกสุรทิน', () => {
    const r = occ('FREQ=MONTHLY', '2028-02-29', '2028-02-01', '2029-03-31');
    expect(r).toHaveLength(12);
    expect(r[0]).toBe('2028-03-29');
    expect(r.some((d) => d.startsWith('2029-02'))).toBe(false);
  });
  it('เริ่มดูไกลจาก anchor หลายปีได้ถูกต้อง', () => {
    expect(occ('FREQ=MONTHLY', '2026-11-15', '2030-05-01', '2030-06-30')).toEqual([
      '2030-05-15',
      '2030-06-15',
    ]);
  });
});

describe('isOccurrence', () => {
  it('ตรวจวันที่ที่กฎให้ผล', () => {
    const rule = R('FREQ=WEEKLY;BYDAY=MO');
    expect(isOccurrence(rule, '2026-11-02', '2026-11-09')).toBe(true);
    expect(isOccurrence(rule, '2026-11-02', '2026-11-10')).toBe(false);
    expect(isOccurrence(rule, '2026-11-02', '2026-11-02')).toBe(false); // anchor เป็นของแถวแม่
    expect(isOccurrence(rule, '2026-11-02', '2026-10-26')).toBe(false); // ก่อน anchor
    expect(isOccurrence(R('FREQ=DAILY;UNTIL=20261105'), '2026-11-02', '2026-11-06')).toBe(false);
  });
});

/** เทียบกับการไล่ทีละวันแบบเขียนแยก (brute force) */
describe('property: ตรงกับ brute force', () => {
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const mk = (s: string) => new Date(`${s}T00:00:00Z`);
  function brute(rule: Rule, anchor: string, from: string, to: string): string[] {
    const out: string[] = [];
    const a = mk(anchor);
    const monday = (d: Date) => new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
    const set = new Set(rule.byday.length ? rule.byday : [a.getUTCDay()]);
    for (
      let d = new Date(a.getTime() + 86_400_000);
      ymd(d) <= to;
      d = new Date(d.getTime() + 86_400_000)
    ) {
      const s = ymd(d);
      if (s < from) continue;
      if (rule.until && s > rule.until) break;
      let ok = false;
      if (rule.freq === 'DAILY')
        ok = Math.round((d.getTime() - a.getTime()) / 86_400_000) % rule.interval === 0;
      else if (rule.freq === 'WEEKLY') {
        const w = Math.round((monday(d).getTime() - monday(a).getTime()) / (7 * 86_400_000));
        ok = w % rule.interval === 0 && set.has(d.getUTCDay());
      } else {
        const md =
          (d.getUTCFullYear() - a.getUTCFullYear()) * 12 + d.getUTCMonth() - a.getUTCMonth();
        ok = md % rule.interval === 0 && d.getUTCDate() === a.getUTCDate();
      }
      if (ok) out.push(s);
    }
    return out;
  }
  // สุ่มแบบกำหนดผลได้ (LCG)
  let seed = 20261104;
  const rnd = (n: number) => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed % n;
  };
  it('400 กฎสุ่ม', () => {
    const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    for (let i = 0; i < 400; i++) {
      const freq = ['DAILY', 'WEEKLY', 'MONTHLY'][rnd(3)]!;
      let rule = `FREQ=${freq};INTERVAL=${1 + rnd(4)}`;
      if (freq === 'WEEKLY' && rnd(2))
        rule += `;BYDAY=${[...new Set(Array.from({ length: 1 + rnd(3) }, () => days[rnd(7)]!))].join(',')}`;
      const anchor = ymd(new Date(Date.UTC(2026 + rnd(3), rnd(12), 1 + rnd(31))));
      const from = ymd(new Date(Date.UTC(2026 + rnd(3), rnd(12), 1 + rnd(28))));
      const to = ymd(new Date(mk(from).getTime() + (1 + rnd(200)) * 86_400_000));
      if (rnd(3) === 0)
        rule += `;UNTIL=${ymd(new Date(mk(anchor).getTime() + rnd(300) * 86_400_000)).replace(/-/g, '')}`;
      const parsed = R(rule);
      expect(
        occurrences(parsed, anchor, from, to, 10_000),
        `${rule} anchor=${anchor} ${from}..${to}`,
      ).toEqual(brute(parsed, anchor, from, to));
    }
  });
});

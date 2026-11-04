import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  dayLoad,
  deadlineBoost,
  fmtDuration,
  insight,
  nextUp,
  plannedMinutes,
  score,
  upcomingAppointment,
  type PlanTask,
  type WorkHours,
} from '../apps/web/src/lib/planner';

const WORK: WorkHours = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] };
const WED = '2026-11-04'; // พุธ
const SAT = '2026-11-07';
const NOW = new Date('2026-11-04T03:00:00Z'); // 10:00 เวลาไทย
const at = (hm: string, d = WED) => new Date(`${d}T${hm}:00+07:00`).toISOString();

let n = 0;
const mk = (o: Partial<PlanTask> = {}): PlanTask => ({
  id: `t${++n}`,
  title: `งาน${n}`,
  status: 'todo',
  allDay: false,
  startAt: null,
  endAt: null,
  dueAt: null,
  dueDate: null,
  estimateMinutes: null,
  urgency: 2,
  importance: 2,
  snoozeCount: 0,
  ...o,
});
const appt = (s: string, e: string, o: Partial<PlanTask> = {}) =>
  mk({ startAt: at(s), endAt: at(e), ...o });

describe('ภาระงาน (dayLoad)', () => {
  it('available = ชั่วโมงทำงาน − นัด ; planned = estimate ของงานที่ยังไม่เสร็จ (ไม่มี estimate นับ 30 นาที)', () => {
    const tasks = [
      appt('10:00', '12:00'), // นัด 2 ชม.
      mk({ estimateMinutes: 60 }),
      mk(), // ไม่มี estimate = 30
    ];
    const l = dayLoad(WED, WORK, tasks);
    expect(l.workMinutes).toBe(540);
    expect(l.appointmentMinutes).toBe(120);
    expect(l.available).toBe(420);
    expect(l.planned).toBe(90); // นัดไม่ถูกนับเป็น planned
    expect(l.ratio).toBeCloseTo(90 / 420);
    expect(l.status).toBe('ok');
  });

  it('เกณฑ์สี: ≤70% เขียว, 70–100% เหลือง, >100% แดง', () => {
    const load = (min: number) => dayLoad(WED, WORK, [mk({ estimateMinutes: min })]);
    expect(load(378).status).toBe('ok'); // 70% พอดี
    expect(load(379).status).toBe('warn');
    expect(load(540).status).toBe('warn'); // 100% พอดี
    expect(load(541).status).toBe('over');
  });

  it('งานเสร็จ/ยกเลิกไม่นับเป็นภาระ แต่นัดที่เสร็จแล้วยังกินเวลาของวันนั้น', () => {
    const l = dayLoad(WED, WORK, [
      mk({ status: 'done', estimateMinutes: 120 }),
      mk({ status: 'cancelled', estimateMinutes: 120 }),
      appt('09:00', '10:00', { status: 'done' }),
    ]);
    expect(l.planned).toBe(0);
    expect(l.appointmentMinutes).toBe(60);
    expect(l.status).toBe('ok');
  });

  it('นัดทับซ้อนกันนับครั้งเดียว และตัดเฉพาะส่วนที่อยู่ในชั่วโมงทำงาน', () => {
    const l = dayLoad(WED, WORK, [
      appt('09:00', '11:00'),
      appt('10:00', '12:00'), // ทับ → รวมเป็น 09:00–12:00
      appt('17:00', '20:00'), // เลยเวลาเลิกงาน → นับแค่ 17:00–18:00
      appt('06:00', '08:00'), // ก่อนเริ่มงาน → ไม่นับ
    ]);
    expect(l.appointmentMinutes).toBe(180 + 60);
    expect(l.available).toBe(540 - 240);
  });

  it('วันหยุด = off (ไม่ตีเป็นเกินภาระ) แม้มีงาน', () => {
    const l = dayLoad(SAT, WORK, [mk({ estimateMinutes: 600 })]);
    expect(l.status).toBe('off');
    expect(l.ratio).toBeNull();
    expect(l.planned).toBe(600);
  });

  it('นัดเต็มวัน: ไม่มีงานค้าง = ok, มีงานค้าง = over', () => {
    const full = appt('09:00', '18:00');
    expect(dayLoad(WED, WORK, [full]).status).toBe('ok');
    expect(dayLoad(WED, WORK, [full, mk()]).status).toBe('over');
  });

  it('ไม่มีงานเลย = ok / ตั้งชั่วโมงทำงานผิดปกติ (เลิกก่อนเริ่ม) ไม่ crash', () => {
    expect(dayLoad(WED, WORK, []).status).toBe('ok');
    const l = dayLoad(WED, { ...WORK, start: '18:00', end: '09:00' }, [mk()]);
    expect(l.available).toBe(0);
    expect(l.status).toBe('over');
  });
});

describe('คะแนนงาน (score)', () => {
  it('urgency×2 + importance×2 + deadlineBoost', () => {
    expect(score(mk({ urgency: 4, importance: 3 }), { today: WED })).toBe(14);
    const b = (dueDate: string | null) => deadlineBoost(mk({ dueDate }), WED);
    expect(b('2026-11-03')).toBe(8); // เลยกำหนด
    expect(b('2026-11-04')).toBe(6); // วันนี้
    expect(b('2026-11-05')).toBe(4); // พรุ่งนี้
    expect(b('2026-11-07')).toBe(2); // ≤ 3 วัน
    expect(b('2026-11-08')).toBe(0);
    expect(b(null)).toBe(0);
  });
  it('dueAt ใช้วันตามเวลาไทย (23:30 ไทย = 16:30Z ยังเป็นวันเดียวกัน)', () => {
    expect(deadlineBoost(mk({ dueAt: at('23:30') }), WED)).toBe(6);
    expect(deadlineBoost(mk({ dueAt: at('00:30', '2026-11-05') }), WED)).toBe(4);
  });
  it('เลื่อนบ่อยถูกหักครั้งละ 0.5 สูงสุด 2, Top 3 +3', () => {
    const base = score(mk(), { today: WED });
    expect(score(mk({ snoozeCount: 1 }), { today: WED })).toBe(base - 0.5);
    expect(score(mk({ snoozeCount: 9 }), { today: WED })).toBe(base - 2);
    const t = mk();
    expect(score(t, { today: WED, top3: new Set([t.id]) })).toBe(base + 3);
  });
});

describe('"ทำต่อไป" (nextUp)', () => {
  const ctx = { today: WED };
  it('เลือกคะแนนสูงสุดจากงานที่ลงมือได้ตอนนี้', () => {
    const low = mk({ title: 'ต่ำ', dueDate: WED });
    const high = mk({ title: 'สูง', urgency: 4, importance: 4, dueDate: WED });
    const r = nextUp([low, high], NOW, ctx)!;
    expect(r.task.id).toBe(high.id);
    expect(r.reason).toBe('due_today');
  });
  it('งานเลยกำหนดได้แต้มสูงขึ้นและเหตุผล overdue', () => {
    const late = mk({ dueDate: '2026-11-01' });
    const today = mk({ dueDate: WED });
    const r = nextUp([today, late], NOW, ctx)!;
    expect(r.task.id).toBe(late.id);
    expect(r.reason).toBe('overdue');
  });
  it('ไม่แนะนำงานที่เริ่มทีหลังเกิน 60 นาที, งานไม่มีวัน (Inbox), งานเสร็จ/ยกเลิก, วันอนาคต', () => {
    const later = appt('14:00', '15:00', { urgency: 4, importance: 4 });
    const inbox = mk({ urgency: 4, importance: 4 });
    const done = mk({ status: 'done', urgency: 4, importance: 4, dueDate: WED });
    const cancelled = mk({ status: 'cancelled', dueDate: WED });
    const future = mk({ dueDate: '2026-11-09', urgency: 4, importance: 4 });
    expect(nextUp([later, inbox, done, cancelled, future], NOW, ctx)).toBeNull();
    const soon = appt('10:40', '11:00'); // เริ่มใน 40 นาที
    expect(nextUp([later, soon], NOW, ctx)!.task.id).toBe(soon.id);
  });
  it('กำลังทำ (doing) ระบุเหตุผล doing; คะแนนเท่ากันเลือกที่เวลาเร็วกว่า', () => {
    const doing = mk({ status: 'doing', dueDate: WED });
    expect(nextUp([doing], NOW, ctx)!.reason).toBe('doing');
    const a = mk({ title: 'ข', dueAt: at('15:00') });
    const b = mk({ title: 'ก', dueAt: at('12:00') });
    expect(nextUp([a, b], NOW, ctx)!.task.id).toBe(b.id);
  });
  it('เลื่อนบ่อยทำให้ลำดับตกลง', () => {
    const stale = mk({ dueDate: WED, snoozeCount: 4 }); // −2
    const fresh = mk({ dueDate: WED });
    expect(nextUp([stale, fresh], NOW, ctx)!.task.id).toBe(fresh.id);
  });
  it('ไม่มีงานเลย = null', () => {
    expect(nextUp([], NOW, ctx)).toBeNull();
  });
});

describe('นัดที่ใกล้จะถึง', () => {
  it('เริ่มภายใน 30 นาที ไม่นับตัวที่ถูกแนะนำและนัดที่เริ่มแล้ว/เลยไป', () => {
    const soon = appt('10:20', '11:00'); // อีก 20 นาที
    const later = appt('11:00', '12:00');
    const started = appt('09:30', '10:30');
    const r = upcomingAppointment([later, started, soon], NOW)!;
    expect(r.task.id).toBe(soon.id);
    expect(r.minutes).toBe(20);
    expect(upcomingAppointment([soon], NOW, 30, soon.id)).toBeNull();
    expect(upcomingAppointment([later], NOW)).toBeNull();
  });
});

describe('Insight ของ Dobby (4 สถานการณ์หลัก)', () => {
  const run = (tasks: PlanTask[], overdueCount = 0) =>
    insight({ today: WED, tasks, overdueCount, load: dayLoad(WED, WORK, tasks) });

  it('1) ไม่มีงาน → ให้กำลังใจ', () => {
    const r = run([]);
    expect(r.kind).toBe('empty');
    expect(r.mood).toBe('relaxed');
    expect(run([], 3).kind).toBe('carry');
    expect(run([], 3).text).toContain('3 งาน');
  });
  it('2) โหลดเบา → บอกจำนวนงาน เวลาที่ใช้ และเวลาว่างจากข้อมูลจริง', () => {
    const r = run([mk({ estimateMinutes: 120 }), mk({ estimateMinutes: 60 })]);
    expect(r.kind).toBe('light');
    expect(r.text).toContain('2 งาน');
    expect(r.text).toContain('3 ชม.');
    expect(r.text).toContain('ว่างอีก 6 ชม.');
  });
  it('3) โหลดเกิน → เตือนให้ย้ายงาน และมีตัวเลขจริง', () => {
    const r = run([mk({ estimateMinutes: 600 })]);
    expect(r.kind).toBe('over');
    expect(r.mood).toBe('busy');
    expect(r.text).toContain('10 ชม.');
    expect(r.text).toContain('ย้าย');
  });
  it('4) มีเดดไลน์ใกล้ → บอกเวลาของเดดไลน์ที่เร็วที่สุด', () => {
    const r = run([mk({ dueAt: at('17:00') }), mk({ dueAt: at('15:30') })]);
    expect(r.kind).toBe('deadline');
    expect(r.text).toContain('2 งาน');
    expect(r.text).toContain('15:30');
    expect(run([mk({ dueAt: at('17:00') })]).text).toBe('เหลือเดดไลน์ 1 งาน ก่อน 17:00');
    // งานทั้งวันที่มีแค่วันที่ ไม่ใช่เดดไลน์ (ไม่ขึ้นข้อความเดดไลน์)
    expect(run([mk({ allDay: true, dueDate: WED })]).kind).toBe('light');
  });
  it('ทำครบแล้ว = ยินดี; โหลดเกินมาก่อนเดดไลน์; ค่อนข้างเต็ม; วันหยุด', () => {
    expect(run([mk({ status: 'done' })]).mood).toBe('happy');
    expect(run([mk({ estimateMinutes: 600, dueAt: at('17:00') })]).kind).toBe('over');
    expect(run([mk({ estimateMinutes: 450 })]).kind).toBe('warn');
    const off = insight({
      today: SAT,
      tasks: [mk({ estimateMinutes: 60 })],
      overdueCount: 0,
      load: dayLoad(SAT, WORK, [mk({ estimateMinutes: 60 })]),
    });
    expect(off.kind).toBe('off');
  });
  it('ครบทุกงานแต่ยังมีงานค้างเลยกำหนด ไม่ประกาศว่าทำครบ', () => {
    expect(run([mk({ status: 'done' })], 2).kind).not.toBe('all_done');
  });
});

describe('timeline ของวัน', () => {
  it('เรียงตามเวลา มีเส้น "ตอนนี้" ตามเวลาไทย และช่วงว่าง ≥ 45 นาที', () => {
    const tasks = [appt('13:00', '14:00'), appt('09:00', '09:30'), appt('10:30', '11:00')];
    const tl = buildTimeline(tasks, WED, WORK, NOW); // ตอนนี้ 10:00
    const view = tl.map((e) =>
      e.kind === 'item'
        ? `item@${e.startMin}`
        : e.kind === 'gap'
          ? `gap@${e.startMin}-${e.endMin}`
          : `now@${e.min}`,
    );
    expect(view).toEqual([
      'item@540', // 09:00 (ผ่านแล้ว)
      'now@600', // 10:00
      'item@630', // 10:30  (ช่วง 10:00–10:30 สั้นกว่า 45 นาที ไม่เป็นช่วงว่าง)
      'gap@660-780', // 11:00–13:00
      'item@780', // 13:00
      'gap@840-1080', // 14:00–18:00
    ]);
    const first = tl[0]!;
    expect(first.kind === 'item' && first.past).toBe(true);
  });
  it('เส้นตอนนี้ขยับตามเวลาจริง', () => {
    const tasks = [appt('09:00', '10:00'), appt('15:00', '16:00')];
    const at14 = new Date('2026-11-04T07:00:00Z'); // 14:00 ไทย
    const tl = buildTimeline(tasks, WED, WORK, at14);
    const nowIdx = tl.findIndex((e) => e.kind === 'now');
    const nxt = tl[nowIdx + 1]!;
    expect(nxt.kind).toBe('gap'); // 14:00–15:00 ว่าง 60 นาที
    expect((tl[nowIdx] as { min: number }).min).toBe(840);
  });
  it('จุดเวลา/เดดไลน์เป็นรายการแบบ point; งานทั้งวันและไม่มีเวลาไม่อยู่ใน timeline', () => {
    const p = mk({ startAt: at('16:37'), endAt: at('16:37') });
    const d = mk({ dueAt: at('17:00') });
    const allDay = mk({ allDay: true, dueDate: WED });
    const tl = buildTimeline([p, d, allDay, mk()], WED, WORK, NOW);
    const items = tl.filter((e) => e.kind === 'item');
    expect(items).toHaveLength(2);
    expect(items.every((e) => e.kind === 'item' && e.point)).toBe(true);
  });
  it('วันอื่นที่ไม่ใช่วันนี้ไม่มีเส้นตอนนี้ และช่วงว่างนับทั้งชั่วโมงทำงาน', () => {
    const tl = buildTimeline([], '2026-11-05', WORK, NOW);
    expect(tl).toEqual([{ kind: 'gap', startMin: 540, endMin: 1080 }]);
  });
  it('ไม่มีงานวันนี้: มีเส้นตอนนี้ + ช่วงว่างตั้งแต่ตอนนี้ถึงเลิกงาน', () => {
    const tl = buildTimeline([], WED, WORK, NOW);
    expect(tl[0]).toEqual({ kind: 'now', min: 600 });
    expect(tl[1]).toEqual({ kind: 'gap', startMin: 600, endMin: 1080 });
  });
  it('หลังเวลาเลิกงาน: มีแค่เส้นตอนนี้ ไม่มีช่วงว่าง', () => {
    const late = new Date('2026-11-04T14:00:00Z'); // 21:00 ไทย
    expect(buildTimeline([], WED, WORK, late)).toEqual([{ kind: 'now', min: 1260 }]);
  });
});

describe('ตัวช่วย', () => {
  it('plannedMinutes / fmtDuration', () => {
    expect(plannedMinutes([mk({ estimateMinutes: 45 }), mk(), mk({ status: 'done' })])).toBe(75);
    expect(fmtDuration(20)).toBe('20 นาที');
    expect(fmtDuration(180)).toBe('3 ชม.');
    expect(fmtDuration(210)).toBe('3.5 ชม.');
  });
});

import { useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { t } from '../lib/i18n';
import type { WorkSettings } from '../lib/types';
import Mascot from './Mascot';
import TimeField24 from './form/TimeField24';

const STEP_KEY = 'dobby.onboarding.step';
type Notify = 'line' | 'web';

/**
 * Onboarding 3 ข้อ (ข้ามได้ทุกข้อ): เวลาทำงาน → Google Calendar → ช่องทางแจ้งเตือน → จดงานแรกด้วย Quick Add
 * ข้ามทั้งหมด = ใช้ค่าเริ่มต้น (09:00–18:00 จ.–ศ., แจ้งเตือนตามเดิม) แล้วทำทีหลังได้ที่ "ฉัน"
 */
export default function Onboarding({
  onFinish,
  onOpenLine,
}: {
  /** firstTask = true → พาไปจดงานแรกทันที */
  onFinish: (firstTask: boolean) => void;
  onOpenLine: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(() => {
    try {
      const v = Number(sessionStorage.getItem(STEP_KEY));
      return v === 2 || v === 3 ? v : 1;
    } catch {
      return 1;
    }
  });
  const [work, setWork] = useState<WorkSettings>({
    start: '09:00',
    end: '18:00',
    days: [1, 2, 3, 4, 5],
  });
  const [notify, setNotify] = useState<Notify>('line');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const headRef = useRef<HTMLHeadingElement>(null);
  const o = t.onboarding;

  useEffect(() => {
    api
      .getSettings()
      .then((v) => setWork(v.work))
      .catch(() => undefined);
  }, []);
  useEffect(() => headRef.current?.focus(), [step]);
  const go = (n: 1 | 2 | 3) => {
    try {
      sessionStorage.setItem(STEP_KEY, String(n));
    } catch {
      /* ไม่มี storage ก็ข้าม */
    }
    setStep(n);
  };
  const clearStep = () => {
    try {
      sessionStorage.removeItem(STEP_KEY);
    } catch {
      /* ignore */
    }
  };

  async function run(fn: () => Promise<unknown>, next: () => void) {
    setError('');
    setBusy(true);
    try {
      await fn();
      next();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.error.generic);
    } finally {
      setBusy(false);
    }
  }
  const finish = (firstTask: boolean) =>
    void run(
      () => api.patchSettings({ onboardingDone: true }),
      () => {
        clearStep();
        onFinish(firstTask);
      },
    );

  const btn = 'rounded-full px-4 py-2 text-sm font-medium disabled:opacity-60';
  const primary = `${btn} bg-brand-600 text-white hover:bg-brand-700`;
  const ghost = `${btn} border border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onb-title"
    >
      <div className="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <Mascot pose="hello" height={64} />
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {o.step.replace('{n}', String(step))}
            </p>
            <h2
              id="onb-title"
              ref={headRef}
              tabIndex={-1}
              className="text-lg font-bold text-brand-800 outline-none dark:text-brand-200"
            >
              {step === 1 ? o.workTitle : step === 2 ? o.gcalTitle : o.notifyTitle}
            </h2>
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">{o.workHint}</p>
            <div className="grid grid-cols-2 gap-3">
              <TimeField24
                label={t.work.start}
                value={work.start}
                clearable={false}
                onChange={(v) => setWork({ ...work, start: v })}
              />
              <TimeField24
                label={t.work.end}
                value={work.end}
                clearable={false}
                onChange={(v) => setWork({ ...work, end: v })}
              />
            </div>
            <div role="group" aria-label={t.work.days} className="flex flex-wrap gap-1.5">
              {t.work.dayNames.map((name, i) => {
                const d = i + 1;
                const on = work.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    title={t.work.dayFull[i]}
                    onClick={() => {
                      const days = on ? work.days.filter((x) => x !== d) : [...work.days, d].sort();
                      if (days.length) setWork({ ...work, days });
                    }}
                    className={`h-9 min-w-9 rounded-full border px-2 text-sm ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'}`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && <p className="text-sm text-slate-600 dark:text-slate-300">{o.gcalHint}</p>}

        {step === 3 && (
          <fieldset className="space-y-2">
            <legend className="sr-only">{o.notifyTitle}</legend>
            {(['line', 'web'] as Notify[]).map((k) => (
              <label
                key={k}
                className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${notify === k ? 'border-brand-600 bg-brand-50 dark:bg-brand-950' : 'border-slate-300 dark:border-slate-600'}`}
              >
                <input
                  type="radio"
                  name="onb-notify"
                  checked={notify === k}
                  onChange={() => setNotify(k)}
                  className="mt-1 h-4 w-4 accent-brand-600"
                />
                <span>
                  <strong className="block">{k === 'line' ? o.viaLine : o.viaWeb}</strong>
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {k === 'line' ? o.viaLineHint : o.viaWebHint}
                  </span>
                </span>
              </label>
            ))}
            {notify === 'line' && (
              <button type="button" onClick={onOpenLine} className={ghost}>
                {o.linkLine}
              </button>
            )}
          </fieldset>
        )}

        {error && (
          <p
            role="alert"
            className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => finish(false)}
            className="text-sm text-slate-600 underline dark:text-slate-300"
          >
            {o.skipAll}
          </button>
          <div className="flex gap-2">
            {step === 1 && (
              <button
                type="button"
                disabled={busy || work.end <= work.start}
                className={primary}
                onClick={() =>
                  void run(
                    () =>
                      api.patchSettings({
                        workStart: work.start,
                        workEnd: work.end,
                        workDays: work.days,
                      }),
                    () => go(2),
                  )
                }
              >
                {o.next}
              </button>
            )}
            {step === 2 && (
              <>
                <button type="button" className={ghost} onClick={() => go(3)}>
                  {o.skip}
                </button>
                <a
                  href="/auth/google/connect"
                  className={`${primary} inline-flex items-center`}
                  onClick={() => {
                    try {
                      sessionStorage.setItem(STEP_KEY, '3'); // กลับจาก Google แล้วไปข้อ 3 ต่อ
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {o.connect}
                </a>
              </>
            )}
            {step === 3 && (
              <button
                type="button"
                disabled={busy}
                className={primary}
                onClick={() =>
                  void run(
                    () => api.patchSettings({ lineNotifyEnabled: notify === 'line' }),
                    () => finish(true),
                  )
                }
              >
                {o.firstTask}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

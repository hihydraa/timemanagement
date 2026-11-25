import { lazy, Suspense, useState } from 'react';
import AppleCalendarDialog from '../components/AppleCalendarDialog';
import Mascot from '../components/Mascot';
import ModeSwitch from '../components/ModeSwitch';
import { useApp } from '../lib/appContext';
import { t } from '../lib/i18n';
import type { MeTab } from '../lib/route';

const ReviewPage = lazy(() => import('./ReviewPage'));
const StatsPage = lazy(() => import('./StatsPage'));
const AvatarPage = lazy(() => import('./AvatarPage'));
const DaysOffPage = lazy(() => import('./DaysOffPage'));

const TABS: MeTab[] = ['overview', 'daysoff', 'avatar', 'review', 'stats'];

/** แท็บ "ฉัน": Dobby + ตั้งค่า (เวลาทำงาน, LINE, Google, ส่งออก) + สรุปสัปดาห์ + สถิติ */
export default function MePage({ tab }: { tab: MeTab }) {
  const {
    user,
    call,
    gcalStatus,
    goTo,
    openSettings,
    openLine,
    openGcal,
    openExport,
    openImport,
    openAlarms,
    openDobby,
    dobby,
    openOnboarding,
    logout,
  } = useApp();
  const [apple, setApple] = useState(false);
  const row =
    'flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:shadow-md dark:border-slate-700 dark:bg-slate-800';
  const gcalText = gcalStatus?.needsReconnect
    ? t.me.gcalReconnect
    : gcalStatus?.connected
      ? t.me.gcalOn
      : t.me.gcalOff;

  return (
    <div className="space-y-4 py-3">
      <div role="tablist" aria-label={t.me.title} className="flex gap-1 overflow-x-auto">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => goTo('me', k)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm ${tab === k ? 'bg-brand-600 font-medium text-white' : 'border border-slate-300 hover:bg-cool-100 dark:border-slate-600 dark:hover:bg-slate-800'}`}
          >
            {t.me[k]}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-3">
          <section className="flex items-center gap-4 rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950">
            <Mascot pose="hello" height={96} />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-brand-800 dark:text-brand-200">
                {t.me.hello}
                {call ? ` ${call}` : user.name ? ` ${user.name}` : ''}
              </h2>
              <p className="truncate text-sm text-slate-600 dark:text-slate-300">{user.email}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <ModeSwitch />
          </section>

          <ul className="grid gap-3 sm:grid-cols-2">
            <li>
              <button type="button" onClick={openSettings} className={row}>
                <span aria-hidden className="text-2xl">
                  ⚙️
                </span>
                <span>
                  <strong className="block">{t.me.settings}</strong>
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {t.me.settingsHint}
                  </span>
                </span>
              </button>
            </li>
            <li>
              <button type="button" onClick={openLine} className={row}>
                <span aria-hidden className="text-2xl">
                  💬
                </span>
                <span>
                  <strong className="block">{t.me.line}</strong>
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {t.me.lineHint}
                  </span>
                </span>
              </button>
            </li>
            <li>
              <button type="button" onClick={openGcal} className={row}>
                <span aria-hidden className="text-2xl">
                  📅
                </span>
                <span>
                  <strong className="block">{t.me.gcal}</strong>
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {t.me.gcalHint} ·{' '}
                    <span
                      className={
                        gcalStatus?.needsReconnect
                          ? 'font-semibold text-amber-700 dark:text-amber-300'
                          : ''
                      }
                    >
                      {gcalStatus?.needsReconnect && <span aria-hidden>⚠ </span>}
                      {gcalText}
                    </span>
                  </span>
                </span>
              </button>
            </li>
            <li>
              <button type="button" onClick={openDobby} className={row}>
                <span aria-hidden className="text-2xl">
                  🧚
                </span>
                <span>
                  <strong className="block">{t.me.dobby.replace('{name}', dobby)}</strong>
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {t.me.dobbyHint}
                  </span>
                </span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => setApple(true)} className={row}>
                <span aria-hidden className="text-2xl">
                  🍎
                </span>
                <span>
                  <strong className="block">{t.me.apple}</strong>
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {t.me.appleHint}
                  </span>
                </span>
              </button>
            </li>
            <li>
              <button type="button" onClick={openExport} className={row}>
                <span aria-hidden className="text-2xl">
                  📦
                </span>
                <span>
                  <strong className="block">{t.me.export}</strong>
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {t.me.exportHint}
                  </span>
                </span>
              </button>
            </li>
            <li>
              <button type="button" onClick={openAlarms} className={row}>
                <span aria-hidden className="text-2xl">
                  ⏰
                </span>
                <span>
                  <strong className="block">{t.alarms.menu}</strong>
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {t.alarms.menuHint}
                  </span>
                </span>
              </button>
            </li>
            <li>
              <button type="button" onClick={openImport} className={row}>
                <span aria-hidden className="text-2xl">
                  📥
                </span>
                <span>
                  <strong className="block">{t.import.menu}</strong>
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {t.import.menuHint}
                  </span>
                </span>
              </button>
            </li>
            <li>
              <button type="button" onClick={openOnboarding} className={row}>
                <span aria-hidden className="text-2xl">
                  🧭
                </span>
                <span>
                  <strong className="block">{t.onboarding.redo}</strong>
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {t.onboarding.redoHint}
                  </span>
                </span>
              </button>
            </li>
          </ul>

          <div className="flex flex-wrap items-center gap-3 pt-2 text-sm">
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-slate-300 px-4 py-2 hover:bg-cool-100 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              {t.me.logout}
            </button>
            <nav aria-label={t.me.legal} className="flex gap-3 text-xs">
              <a href="/privacy" className="text-iris-600 underline dark:text-iris-400">
                {t.login.privacy}
              </a>
              <a href="/terms" className="text-iris-600 underline dark:text-iris-400">
                {t.login.terms}
              </a>
            </nav>
          </div>
        </div>
      )}

      {apple && <AppleCalendarDialog onClose={() => setApple(false)} />}
      <Suspense fallback={<p role="status">{t.loading}</p>}>
        {tab === 'review' && <ReviewPage />}
        {tab === 'avatar' && <AvatarPage />}
        {tab === 'daysoff' && <DaysOffPage />}
        {tab === 'stats' && <StatsPage />}
      </Suspense>
    </div>
  );
}

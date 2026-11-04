import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { AppContext, type AppCtx, type View } from '../lib/appContext';
import { t } from '../lib/i18n';
import CelebrateToast from './CelebrateToast';
import Mascot from './Mascot';
import type { Category, GcalStatus, PushStatus, User } from '../lib/types';
import { useOnline } from '../lib/pwa';
import ExportDialog from './ExportDialog';
import GcalDialog from './GcalDialog';
import LineDialog from './LineDialog';
import SettingsDialog from './SettingsDialog';

const CalendarPage = lazy(() => import('../pages/CalendarPage'));
const FocusPage = lazy(() => import('../pages/FocusPage'));
const InboxPage = lazy(() => import('../pages/InboxPage'));
const MatrixPage = lazy(() => import('../pages/MatrixPage'));
const ReviewPage = lazy(() => import('../pages/ReviewPage'));
const StatsPage = lazy(() => import('../pages/StatsPage'));

const VIEWS: View[] = ['calendar', 'inbox', 'matrix', 'focus', 'review', 'stats'];
const viewFromHash = (): View => {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (VIEWS as string[]).includes(h) ? (h as View) : 'calendar';
};

export default function AppShell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [view, setView] = useState<View>(viewFromHash);
  const [categories, setCategories] = useState<Category[]>([]);
  const [gcal, setGcal] = useState<GcalStatus | null>(null);
  const [push, setPush] = useState<PushStatus | null>(null);
  const [dialog, setDialog] = useState<'line' | 'settings' | 'gcal' | 'export' | null>(null);
  const [gcalNotice, setGcalNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const online = useOnline();

  // แท็บเก็บใน URL hash → ปุ่มย้อนกลับของเบราว์เซอร์ใช้ได้ และแชร์ลิงก์ได้
  useEffect(() => {
    const fn = () => setView(viewFromHash());
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  const goTo = useCallback((v: View) => {
    window.location.hash = v === 'calendar' ? '' : `/${v}`;
    setView(v);
  }, []);

  const reloadCategories = useCallback(() => {
    api
      .listCategories()
      .then(setCategories)
      .catch(() => undefined);
  }, []);
  const refreshPush = useCallback(() => {
    api
      .pushStatus()
      .then(setPush)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    reloadCategories(); // จำเป็นต่อสีของ event
    // สถานะ Google/โควตา ไม่จำเป็นต่อการแสดงผลครั้งแรก: รอให้เบราว์เซอร์ว่างก่อน เพื่อไม่แย่งเวลากับการ render ปฏิทิน
    const run = () => {
      refreshPush();
      api
        .gcalStatus()
        .then(setGcal)
        .catch(() => undefined);
    };
    const idle = (
      window as unknown as {
        requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    const id = idle ? idle(run, { timeout: 3000 }) : window.setTimeout(run, 1200);
    return () => {
      if (!idle) window.clearTimeout(id);
    };
  }, [reloadCategories, refreshPush]);

  // ผลจากการ redirect กลับจาก Google (?gcal=connected|denied|error&reason=...)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get('gcal');
    if (!r) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    const reason = q.get('reason');
    setGcalNotice(
      r === 'connected'
        ? { kind: 'ok', text: t.gcal.connectedOk }
        : r === 'denied'
          ? { kind: 'error', text: t.gcal.denied }
          : {
              kind: 'error',
              text:
                reason === 'scope'
                  ? t.gcal.errScope
                  : reason === 'refresh'
                    ? t.gcal.errRefresh
                    : t.gcal.errToken,
            },
    );
    setDialog('gcal');
  }, []);

  // ปิดเมนูเมื่อคลิกข้างนอก / กด Esc
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) =>
      !menuRef.current?.contains(e.target as Node) && setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const ctx: AppCtx = useMemo(
    () => ({
      user,
      categories,
      reloadCategories,
      gcalAvailable: !!gcal?.connected && gcal.syncEnabled,
      openLine: () => setDialog('line'),
      openSettings: () => setDialog('settings'),
      goTo,
    }),
    [user, categories, reloadCategories, gcal, goTo],
  );

  const menuItem = (label: React.ReactNode, onClick: () => void) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setMenuOpen(false);
        onClick();
      }}
      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      {label}
    </button>
  );

  return (
    <AppContext.Provider value={ctx}>
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-brand-700 focus:shadow dark:focus:bg-slate-900"
        >
          {t.skip}
        </a>
        <header className="flex items-center gap-2 border-b border-slate-200 px-3 pt-2 dark:border-slate-700">
          <h1 className="flex items-center gap-1.5 pb-1 text-lg font-bold text-brand-700 dark:text-brand-300">
            <img
              src="/icons/favicon-64.png"
              alt=""
              width={32}
              height={32}
              className="rounded-lg"
              decoding="async"
            />
            {t.appName}
          </h1>
          <nav aria-label="หน้าหลัก" className="-mb-px flex flex-1 gap-1 overflow-x-auto">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                aria-current={view === v ? 'page' : undefined}
                onClick={() => goTo(v)}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${view === v ? 'border-brand-600 font-semibold text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'}`}
              >
                {t.views[v]}
              </button>
            ))}
          </nav>
          <div ref={menuRef} className="relative pb-1">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {t.menu.label} ▾
              {gcal?.needsReconnect && (
                <span aria-label="ต้องเชื่อมใหม่" className="ml-1 text-amber-600">
                  ⚠
                </span>
              )}
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
              >
                {menuItem(t.settings.button, () => setDialog('settings'))}
                {menuItem(
                  <>
                    {t.gcal.button}
                    {gcal?.connected && gcal.syncEnabled && (
                      <span aria-label="เชื่อมอยู่" className="ml-1 text-green-600">
                        ●
                      </span>
                    )}
                  </>,
                  () => setDialog('gcal'),
                )}
                {menuItem(t.line.button, () => setDialog('line'))}
                {menuItem(t.menu.export, () => setDialog('export'))}
                <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                {menuItem(
                  `${t.nav.logout} (${user.email})`,
                  () => void api.logout().finally(onLogout),
                )}
              </div>
            )}
          </div>
        </header>

        {!online && (
          <p
            role="status"
            className="mx-3 mt-2 flex items-center gap-3 rounded-lg bg-slate-100 p-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Mascot pose="rest" height={44} />
            <span>
              <strong>{t.mascot.offline}</strong> — {t.offlineBanner}
            </span>
          </p>
        )}

        {push && push.limitConfigured && (push.nearLimit || push.exhausted) && (
          <p
            role="status"
            className={`mx-3 mt-2 rounded p-2 text-sm ${push.exhausted ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}
          >
            {push.exhausted
              ? t.settings.quotaFull
              : `${t.settings.quotaBanner} (${push.used}/${push.limit})`}
          </p>
        )}

        <div id="main" tabIndex={-1} className="flex-1 outline-none">
          <Suspense
            fallback={
              <div
                role="status"
                className="flex flex-col items-center gap-2 p-8 text-slate-600 dark:text-slate-300"
              >
                <Mascot pose="morning" height={110} bob />
                <p>{t.mascot.loading}</p>
              </div>
            }
          >
            {view === 'calendar' && <CalendarPage />}
            {view === 'inbox' && <InboxPage />}
            {view === 'matrix' && <MatrixPage />}
            {view === 'focus' && <FocusPage />}
            {view === 'review' && <ReviewPage />}
            {view === 'stats' && <StatsPage />}
          </Suspense>
        </div>

        {dialog === 'line' && <LineDialog onClose={() => setDialog(null)} />}
        {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
        {dialog === 'settings' && (
          <SettingsDialog
            onClose={() => {
              setDialog(null);
              refreshPush();
            }}
            onOpenLine={() => setDialog('line')}
            onSaved={refreshPush}
          />
        )}
        {dialog === 'gcal' && (
          <GcalDialog
            notice={gcalNotice}
            onClose={() => {
              setDialog(null);
              setGcalNotice(null);
            }}
            onStatusChange={setGcal}
          />
        )}
      </div>
      <CelebrateToast />
    </AppContext.Provider>
  );
}

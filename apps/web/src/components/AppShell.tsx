import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { AppContext, type AppCtx } from '../lib/appContext';
import {
  resolveRoute,
  routeToHash,
  type MeTab,
  type Resolved,
  type Route,
  type View,
} from '../lib/route';
import { useMedia } from '../lib/useMedia';
import { t } from '../lib/i18n';
import CelebrateToast from './CelebrateToast';
import PageContainer from './PageContainer';
import Mascot from './Mascot';
import MiniTimer from './MiniTimer';
import { BottomTabBar, TopTabs } from './nav/MainNav';
import type { Category, GcalStatus, PushStatus, User } from '../lib/types';
import { useOnline } from '../lib/pwa';
import ExportDialog from './ExportDialog';
import GcalDialog from './GcalDialog';
import LineDialog from './LineDialog';
import SettingsDialog from './SettingsDialog';

const TodayPage = lazy(() => import('../pages/TodayPage'));
const PlanPage = lazy(() => import('../pages/CalendarPage'));
const FocusPage = lazy(() => import('../pages/FocusPage'));
const MePage = lazy(() => import('../pages/MePage'));

/** อ่านเส้นทางปัจจุบัน และแปลงเส้นทางเก่า (/inbox /calendar /matrix /review /stats) เป็นแบบมาตรฐานโดยไม่ทำให้ลิงก์เดิมพัง */
const readRoute = (): Resolved => resolveRoute(window.location);

export default function AppShell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [route, setRoute] = useState<Route>(() => readRoute().route);
  const narrow = useMedia('(max-width: 767px)');
  const [categories, setCategories] = useState<Category[]>([]);
  const [gcal, setGcal] = useState<GcalStatus | null>(null);
  const [push, setPush] = useState<PushStatus | null>(null);
  const [dialog, setDialog] = useState<'line' | 'settings' | 'gcal' | 'export' | null>(null);
  const [gcalNotice, setGcalNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const online = useOnline();

  // เส้นทางเก็บใน URL (hash) → ปุ่มย้อนกลับใช้ได้ แชร์ลิงก์ได้; เส้นทางเก่าถูก redirect เป็นแบบมาตรฐานทันที
  useEffect(() => {
    const sync = () => {
      const r = readRoute();
      if (r.redirected)
        window.history.replaceState(null, '', `/${window.location.search}${r.hash}`);
      setRoute(r.route);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const goTo = useCallback((v: View, sub?: string) => {
    const next: Route =
      v === 'today'
        ? { view: v, anchor: sub }
        : v === 'plan'
          ? { view: v, plan: sub === 'matrix' ? 'matrix' : undefined }
          : v === 'me'
            ? { view: v, me: (sub as MeTab | undefined) ?? 'overview' }
            : { view: v };
    const h = routeToHash(next);
    if (window.location.hash === h || (h === '' && !window.location.hash)) setRoute(next);
    else window.location.hash = h === '' ? '/today' : h; // hashchange จะอัปเดต route ให้
  }, []);
  const newTask = useCallback(() => {
    try {
      sessionStorage.setItem('dobby.openNew', '1');
    } catch {
      /* ไม่มี storage ก็ข้าม */
    }
    goTo('today');
    window.dispatchEvent(new Event('dobby:new-task'));
  }, [goTo]);

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

  const ctx: AppCtx = useMemo(
    () => ({
      user,
      categories,
      reloadCategories,
      gcalAvailable: !!gcal?.connected && gcal.syncEnabled,
      gcalStatus: gcal,
      route,
      openLine: () => setDialog('line'),
      openSettings: () => setDialog('settings'),
      openGcal: () => setDialog('gcal'),
      openExport: () => setDialog('export'),
      logout: () => void api.logout().finally(onLogout),
      goTo,
      newTask,
    }),
    [user, categories, reloadCategories, gcal, route, goTo, newTask, onLogout],
  );

  return (
    <AppContext.Provider value={ctx}>
      <div className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-brand-700 focus:shadow dark:focus:bg-slate-900"
        >
          {t.skip}
        </a>
        <header className="border-b border-slate-200 dark:border-slate-700">
          <PageContainer className="flex items-center gap-2 pt-2">
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
            {/* เมนูหลักเรนเดอร์ชุดเดียวตามขนาดจอ: เดสก์ท็อป = แถบบน, มือถือ = แถบล่าง */}
            {!narrow ? (
              <TopTabs view={route.view} warn={!!gcal?.needsReconnect} onGo={(v) => goTo(v)} />
            ) : (
              <span className="flex-1" />
            )}
          </PageContainer>
        </header>

        <PageContainer className="flex-1">
          {!online && (
            <p
              role="status"
              className="mt-2 flex items-center gap-3 rounded-lg bg-slate-100 p-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200"
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
              className={`mt-2 rounded p-2 text-sm ${push.exhausted ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}
            >
              {push.exhausted
                ? t.settings.quotaFull
                : `${t.settings.quotaBanner} (${push.used}/${push.limit})`}
            </p>
          )}

          <main id="main" tabIndex={-1} className={`flex-1 outline-none ${narrow ? 'pb-28' : ''}`}>
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
              {route.view === 'today' && <TodayPage />}
              {route.view === 'plan' && <PlanPage />}
              {route.view === 'me' && <MePage tab={route.me ?? 'overview'} />}
              {route.view === 'focus' && <FocusPage />}
            </Suspense>
          </main>
        </PageContainer>

        {narrow && (
          <BottomTabBar
            view={route.view}
            warn={!!gcal?.needsReconnect}
            onGo={(v) => goTo(v)}
            onNew={newTask}
          />
        )}
        {route.view !== 'focus' && <MiniTimer onOpen={() => goTo('focus')} />}

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

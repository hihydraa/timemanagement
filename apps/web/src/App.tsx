import { lazy, Suspense, useEffect, useState } from 'react';
import { api } from './lib/api';
import { t } from './lib/i18n';
import type { User } from './lib/types';
import LoginPage from './pages/LoginPage';

// AppShell (ปฏิทิน/FullCalendar ฯลฯ) โหลดหลัง login เท่านั้น หน้า login จึงเบา
const loadShell = () => import('./components/AppShell');
const AppShell = lazy(loadShell);

// ผู้ใช้ที่เคยล็อกอินบนเครื่องนี้: เริ่มโหลด chunk ของแอปขนานไปกับการเช็ค session (ไม่รอเป็นลำดับ)
// ผู้เข้าใหม่ไม่โหลด เพื่อให้หน้า login เบา
const HINT = 'dobby.returning';
const hasHint = (() => {
  try {
    return localStorage.getItem(HINT) === '1';
  } catch {
    return false;
  }
})();
const preloadApp = () => {
  void loadShell();
  // หน้าแรกคือ "วันนี้" (ยกเว้นเปิดลิงก์ปฏิทินโดยตรง)
  void import(
    window.location.hash.startsWith('#/calendar') || window.location.search.includes('task=')
      ? './pages/CalendarPage'
      : './pages/TodayPage'
  );
};
if (hasHint) preloadApp();

type State =
  { kind: 'loading' } | { kind: 'anon' } | { kind: 'user'; user: User } | { kind: 'error' };

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    api
      .session()
      .then((user) => {
        if (user) {
          try {
            localStorage.setItem(HINT, '1');
          } catch {
            /* ignore */
          }
          preloadApp(); // ล็อกอินอยู่แล้ว: เริ่มโหลดทั้งสอง chunk พร้อมกัน
        }
        setState(user ? { kind: 'user', user } : { kind: 'anon' });
      })
      .catch(() => setState({ kind: 'error' }));
  }, []);

  if (state.kind === 'loading')
    return (
      <p role="status" className="p-6 text-slate-500">
        {t.loading}
      </p>
    );
  if (state.kind === 'error')
    return (
      <p role="alert" className="p-6 text-red-600">
        {t.error.loadFailed}
      </p>
    );
  if (state.kind === 'anon') return <LoginPage />;
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6 text-slate-500">
          {t.loading}
        </p>
      }
    >
      <AppShell user={state.user} onLogout={() => setState({ kind: 'anon' })} />
    </Suspense>
  );
}

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../lib/i18n';

/** กันหน้าขาวเมื่อเกิดข้อผิดพลาดตอน render: แสดงข้อความและปุ่มโหลดใหม่ (ไม่แสดงรายละเอียดทางเทคนิคกับผู้ใช้) */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('render error', error.message, info.componentStack?.split('\n')[1]?.trim());
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold">{t.error.crashTitle}</h1>
        <p role="alert" className="text-slate-600 dark:text-slate-300">
          {t.error.crashBody}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {t.error.reload}
        </button>
      </main>
    );
  }
}

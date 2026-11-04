import { useEffect, useState } from 'react';
import { t } from './lib/i18n';

type Status = 'checking' | 'ok' | 'fail';

export default function App() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => setStatus(r.ok ? 'ok' : 'fail'))
      .catch(() => setStatus('fail'));
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-2 bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <h1 className="text-3xl font-bold">{t.appName}</h1>
      <p className="text-slate-600 dark:text-slate-300">{t.tagline}</p>
      <p role="status" className="text-sm">
        {t.health[status]}
      </p>
    </main>
  );
}

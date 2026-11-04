import Mascot from '../components/Mascot';
import { t } from '../lib/i18n';

export default function LoginPage() {
  const reason = new URLSearchParams(window.location.search).get('login');
  const message =
    reason === 'denied'
      ? t.login.denied
      : reason === 'not_allowed'
        ? t.login.notAllowed
        : reason === 'full'
          ? t.login.full
          : '';
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gradient-to-b from-slate-50 to-brand-50 p-6 text-center dark:from-slate-900 dark:to-brand-950">
      <Mascot pose="hero" height={260} alt={t.mascot.loginHello} bob eager />
      <h1 className="text-4xl font-bold text-brand-700 dark:text-brand-300">{t.appName}</h1>
      <p className="text-slate-600 dark:text-slate-300">{t.tagline}</p>
      <a
        href="/auth/google/login"
        className="mt-1 rounded-full bg-brand-600 px-6 py-3 font-medium text-white shadow-soft hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        {t.login.google}
      </a>
      {message && (
        <p role="alert" className="max-w-sm text-sm text-amber-800 dark:text-amber-300">
          {message}
        </p>
      )}
      <p className="text-xs text-slate-600 dark:text-slate-400">{t.login.hint}</p>
      <nav aria-label="เอกสารทางกฎหมาย" className="flex gap-3 text-xs">
        <a href="/privacy" className="text-brand-700 underline dark:text-brand-300">
          {t.login.privacy}
        </a>
        <a href="/terms" className="text-brand-700 underline dark:text-brand-300">
          {t.login.terms}
        </a>
      </nav>
    </main>
  );
}

import Mascot from '../components/Mascot';
import { t } from '../lib/i18n';

export default function LoginPage() {
  const denied = new URLSearchParams(window.location.search).get('login') === 'denied';
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
      {denied && (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
          {t.login.denied}
        </p>
      )}
      <p className="text-xs text-slate-600 dark:text-slate-400">{t.login.hint}</p>
    </main>
  );
}

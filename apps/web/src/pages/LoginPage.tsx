import { t } from '../lib/i18n';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-4xl font-bold">{t.appName}</h1>
      <p className="text-slate-600 dark:text-slate-300">{t.tagline}</p>
      <a
        href="/auth/google/login"
        className="rounded bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        {t.login.google}
      </a>
      <p className="text-xs text-slate-500">{t.login.hint}</p>
    </main>
  );
}

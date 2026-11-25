import { useCallback, useEffect, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { useApp } from '../lib/appContext';
import { useAvatarLook } from '../lib/avatarLook';
import { t } from '../lib/i18n';
import { renderShareCard, shareOrDownload } from '../lib/shareCard';
import { sayDobby } from '../../../../src/lib/dobbyVoice';
import type { ProgressState } from '../lib/progress';

/** เลเวล สตรีค ภารกิจวันนี้ และตรารางวัล (หน้า "ฉัน") */
export default function ProgressCard() {
  const { reloadGame, call, dobby, tone } = useApp();
  const look = useAvatarLook();
  const [shareMsg, setShareMsg] = useState('');
  const [p, setP] = useState<ProgressState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    api
      .getProgress()
      .then((r) => {
        setP(r);
        setError('');
      })
      .catch(() => setError(t.progress.loadFailed));
  }, []);
  useEffect(load, [load]);

  const claim = async (id: string) => {
    setBusy(id);
    try {
      await api.claimQuest(id);
      reloadGame();
      load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t.progress.claimFailed);
    } finally {
      setBusy('');
    }
  };

  const share = async () => {
    if (!p) return;
    setBusy('share');
    setShareMsg('');
    try {
      const dash = await api.dashboard();
      const done = dash.performance.doneThisWeek;
      const blob = await renderShareCard(look, {
        dobby,
        title: p.level.title,
        level: p.level.level,
        doneThisWeek: done,
        streak: p.streak,
        line: sayDobby(done > 0 ? 'complete' : 'greet_morning', { you: call, dobby, n: 0 }, tone),
      });
      setShareMsg((await shareOrDownload(blob)) === 'shared' ? '' : t.progress.shareSaved);
    } catch {
      setShareMsg(t.progress.shareFailed);
    } finally {
      setBusy('');
    }
  };

  if (error && !p)
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-300">
        {error}
      </p>
    );
  if (!p) return null;
  const lv = p.level;
  return (
    <section
      aria-labelledby="progress-title"
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      <h2 id="progress-title" className="text-lg font-semibold">
        {t.progress.title}
      </h2>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <strong>
            {t.progress.level} {lv.level} · {lv.title}
          </strong>
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {t.progress.toNext(lv.next - lv.xp)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={lv.pct}
          aria-label={`${t.progress.level} ${lv.level}`}
          className="mt-1 h-2.5 overflow-hidden rounded-full bg-cool-100 dark:bg-slate-700"
        >
          <div className="h-full rounded-full bg-brand-600" style={{ width: `${lv.pct}%` }} />
        </div>
        <p className="mt-2 text-sm">
          {t.progress.streak(p.streak)}{' '}
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {t.progress.streakNote}
          </span>
        </p>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold">{t.progress.quests}</h3>
        <ul className="space-y-2">
          {p.quests.map((q) => (
            <li
              key={q.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-cool-100 px-3 py-2 dark:bg-slate-900"
            >
              <span className="min-w-0 text-sm">
                {q.th}
                <span className="ml-2 text-xs text-slate-600 dark:text-slate-300">
                  {q.progress}/{q.target}
                </span>
              </span>
              {q.claimed ? (
                <span className="text-xs font-medium text-brand-700 dark:text-brand-300">
                  {t.progress.claimed}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!q.done || busy === q.id}
                  onClick={() => void claim(q.id)}
                  className="rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40"
                >
                  {t.progress.claim(q.reward)}
                </button>
              )}
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy === 'share'}
          onClick={() => void share()}
          className="rounded-full border border-brand-600 px-4 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50 dark:text-brand-300 dark:hover:bg-slate-700"
        >
          {busy === 'share' ? t.progress.sharing : t.progress.share}
        </button>
        {shareMsg && (
          <span role="status" className="text-xs text-slate-600 dark:text-slate-300">
            {shareMsg}
          </span>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold">{t.progress.badges}</h3>
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {p.badges.map((b) => (
            <li
              key={b.id}
              title={b.earned ? b.hint : `${b.hint} (${t.progress.locked})`}
              className={`flex flex-col items-center gap-0.5 rounded-xl p-2 text-center text-[11px] leading-tight ${b.earned ? 'bg-gold-400/20 dark:bg-slate-900' : 'bg-cool-100 opacity-50 grayscale dark:bg-slate-900'}`}
            >
              <span aria-hidden className="text-2xl">
                {b.icon}
              </span>
              <span>{b.th}</span>
              <span className="sr-only">{b.earned ? b.hint : t.progress.locked}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

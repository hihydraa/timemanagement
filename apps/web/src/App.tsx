import { useEffect, useState } from 'react';
import { api, ApiClientError } from './lib/api';
import { t } from './lib/i18n';
import type { User } from './lib/types';
import CalendarPage from './pages/CalendarPage';
import LoginPage from './pages/LoginPage';

type State =
  { kind: 'loading' } | { kind: 'anon' } | { kind: 'user'; user: User } | { kind: 'error' };

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    api
      .me()
      .then((user) => setState({ kind: 'user', user }))
      .catch((e) =>
        setState(
          e instanceof ApiClientError && e.status === 401 ? { kind: 'anon' } : { kind: 'error' },
        ),
      );
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
  return <CalendarPage user={state.user} onLogout={() => setState({ kind: 'anon' })} />;
}

import { useCallback, useEffect, useState } from 'react';
import { api, clearToken, getToken, setUnauthorizedHandler } from './api.js';
import { MainScreen } from './components/MainScreen.js';
import { Toasts } from './components/Toasts.js';
import { TokenScreen } from './components/TokenScreen.js';
import { storage } from './storage.js';

type Phase = 'boot' | 'token' | 'ready';

const AUTH_KEY = 'fe-hunt.authRequired';
/** Don't hold the cached list hostage to a slow /api/health. */
const HEALTH_TIMEOUT_MS = 4000;

export function App() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [rejected, setRejected] = useState(false);
  const [authRequired, setAuthRequired] = useState(() => storage.get(AUTH_KEY) === '1');

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setRejected(getToken() !== null);
      clearToken();
      setAuthRequired(true);
      storage.set(AUTH_KEY, '1');
      setPhase('token');
    });

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) setPhase((p) => (p === 'boot' ? 'ready' : p));
    }, HEALTH_TIMEOUT_MS);
    api
      .health()
      .then((h) => {
        settled = true;
        setAuthRequired(h.authRequired);
        storage.set(AUTH_KEY, h.authRequired ? '1' : '0');
        setPhase((p) => (p !== 'boot' ? p : h.authRequired && !getToken() ? 'token' : 'ready'));
      })
      .catch(() => {
        // Offline or server down: carry on with cached data; a 401 later still lands on the token screen.
        settled = true;
        setPhase((p) => (p === 'boot' ? 'ready' : p));
      })
      .finally(() => clearTimeout(timer));
    return () => clearTimeout(timer);
  }, []);

  const changeToken = useCallback(() => {
    clearToken();
    setRejected(false);
    setPhase('token');
  }, []);

  return (
    <>
      {phase === 'token' ? (
        <TokenScreen rejected={rejected} onAuthorized={() => setPhase('ready')} />
      ) : (
        <MainScreen enabled={phase === 'ready'} onChangeToken={authRequired ? changeToken : undefined} />
      )}
      <Toasts />
    </>
  );
}

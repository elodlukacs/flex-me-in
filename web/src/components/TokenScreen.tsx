import { useState, type FormEvent } from 'react';
import { api, clearToken, errorMessage, setToken, UnauthorizedError } from '../api.js';
import { Icon } from './Icon.js';

interface TokenScreenProps {
  /** Shown when we got here from a 401 rather than first launch. */
  rejected: boolean;
  onAuthorized: () => void;
}

export function TokenScreen({ rejected, onAuthorized }: TokenScreenProps) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    rejected ? 'That token was not accepted. Enter it again.' : null,
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const token = value.trim();
    if (!token) return;
    setBusy(true);
    setError(null);
    setToken(token);
    try {
      await api.meta();
      onAuthorized();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        clearToken();
        setError('Wrong token. Check FE_HUNT_TOKEN on the server.');
      } else {
        setError(errorMessage(err));
      }
      setBusy(false);
    }
  };

  return (
    <main className="token-screen">
      <img className="token-logo" src="/icons/icon-192.png" alt="" width={72} height={72} />
      <h1>fe-hunt</h1>
      <p className="token-lead">This server is protected. Enter the access token once; it stays on this device.</p>
      <form className="token-form" onSubmit={submit}>
        <label htmlFor="token" className="token-label">
          Access token
        </label>
        <div className="token-row">
          <Icon name="key" />
          <input
            id="token"
            type="password"
            autoComplete="current-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Paste token"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'token-error' : undefined}
          />
        </div>
        {error && (
          <p id="token-error" className="token-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !value.trim()}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </main>
  );
}

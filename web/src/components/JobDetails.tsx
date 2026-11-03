import { useEffect, useState } from 'react';
import { api, errorMessage, isAbort } from '../api.js';

/** Descriptions don't change; keep the ones we've loaded this session. */
const cache = new Map<string, string>();

interface JobDetailsProps {
  id: string;
  domId: string;
}

/** Lazily loaded description. Untrusted text: rendered as text, never as HTML. */
export function JobDetails({ id, domId }: JobDetailsProps) {
  const [text, setText] = useState<string | null>(() => cache.get(id) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (cache.has(id)) return;
    const controller = new AbortController();
    setError(null);
    api
      .description(id, controller.signal)
      .then(({ description }) => {
        const clean = description.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        cache.set(id, clean);
        setText(clean);
      })
      .catch((err: unknown) => {
        if (!isAbort(err)) setError(errorMessage(err));
      });
    return () => controller.abort();
  }, [id, attempt]);

  return (
    <div className="details" id={domId}>
      {error ? (
        <p className="details-error">
          Couldn’t load the description: {error}{' '}
          <button type="button" className="link-btn" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </button>
        </p>
      ) : text === null ? (
        <div className="details-loading" aria-label="Loading description">
          <span className="skel skel-line" />
          <span className="skel skel-line" />
          <span className="skel skel-line short" />
        </div>
      ) : text === '' ? (
        <p className="details-empty">No description from this source. Open the posting for details.</p>
      ) : (
        <p className="details-text">{text}</p>
      )}
    </div>
  );
}

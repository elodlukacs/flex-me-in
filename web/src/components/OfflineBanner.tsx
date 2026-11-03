import { useOnline } from '../connectivity.js';
import { Icon } from './Icon.js';

/** Shown when the browser is offline or the last API call was answered from cache. */
export function OfflineBanner({ onRetry }: { onRetry: () => void }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline" role="status">
      <Icon name="cloud-off" size={18} />
      <span>Offline — showing the last saved list</span>
      <button type="button" className="link-btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

import { useSyncExternalStore } from 'react';

/**
 * Online means: the browser thinks so *and* the last API call reached the
 * server (not the service worker's cache).
 */
type Listener = () => void;

let reachable = true;
let browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    browserOnline = true;
    emit();
  });
  window.addEventListener('offline', () => {
    browserOnline = false;
    emit();
  });
}

export const connectivity = {
  report(ok: boolean): void {
    if (ok === reachable) return;
    reachable = ok;
    emit();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot(): boolean {
    return reachable && browserOnline;
  },
};

export function useOnline(): boolean {
  return useSyncExternalStore(connectivity.subscribe, connectivity.snapshot);
}

import { showToast } from './toasts.js';

/**
 * Registers /sw.js (production builds only) and offers a reload when a new
 * worker is installed and waiting.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  let offered = false;
  const offer = (worker: ServiceWorker) => {
    if (offered) return;
    offered = true;
    showToast('Update available', {
      duration: 0,
      action: {
        label: 'Reload',
        onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }),
      },
    });
  };

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        installing?.addEventListener('statechange', () => {
          // No controller yet means first install, not an update.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) offer(installing);
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
      });
    } catch {
      // No service worker (e.g. plain http on a LAN IP): the app still works online.
    }
  });
}

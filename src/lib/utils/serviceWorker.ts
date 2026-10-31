/**
 * Registers the service worker that keeps the app shell and hashed bundles
 * available offline (and receives Web Push). Registration is production-only:
 * in `vite dev` the worker would cache dev modules and get in the way.
 *
 * The worker is registered on every start, not only when push is enabled —
 * offline support must not depend on the notification setting.
 */
export function registerServiceWorker(): void {
	if (!import.meta.env.PROD) return;
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

	navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
		// Offline support is best-effort; the app still works online.
	});
}

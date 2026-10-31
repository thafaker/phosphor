/**
 * Reactive connectivity state.
 *
 * `navigator.onLine` is only a hint (a captive portal still counts as online),
 * but it is exactly what the UI needs: an explicit "you are offline" banner
 * instead of a generic request error. Feeds additionally keep their last page
 * cached, so the banner can promise that the content on screen is not gone.
 */
class NetworkStore {
	online = $state(true);

	/** Called once from the app shell; returns the listener cleanup. */
	init(): () => void {
		if (typeof window === 'undefined') return () => {};

		this.online = navigator.onLine;
		const update = () => (this.online = navigator.onLine);
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
		};
	}
}

export const network = new NetworkStore();

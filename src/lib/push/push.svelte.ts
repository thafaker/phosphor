import { ApiError, apiRequest } from '#lib/api/client.ts';
import type { InstanceV2 } from '#lib/api/types.ts';

const SW_PATH = '/sw.js';
const SUBSCRIPTION_PATH = '/api/v1/push/subscription';

/**
 * Decode a Base64URL VAPID public key into the byte array that
 * `PushManager.subscribe()` expects as `applicationServerKey`.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(normalised);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

/**
 * Owns Phosphor's Web Push subscription: registers the service worker,
 * negotiates the browser subscription and mirrors it to GoToSocial.
 *
 * GoToSocial generates its own VAPID key pair (stored in its DB) and hands
 * out the public key via `GET /api/v2/instance` → `configuration.vapid`.
 */
class PushStore {
	supported = $state(false);
	enabled = $state(false);
	busy = $state(false);
	error = $state<string | null>(null);
	/** True when the failure is most likely a stale token missing the `push` scope. */
	needsRelogin = $state(false);

	init(): void {
		this.supported =
			typeof window !== 'undefined' &&
			'serviceWorker' in navigator &&
			'PushManager' in window &&
			'Notification' in window;
	}

	/**
	 * Reconcile local state with the browser subscription and, when one exists,
	 * (re-)register it with GoToSocial.
	 *
	 * The re-registration is the important part. If the very first POST was
	 * rejected (e.g. 403 "insufficient scope" on a token issued before the
	 * `push` scope was added), the browser keeps its subscription anyway — so
	 * without retrying, the server would never learn about it and no push could
	 * ever be delivered. Re-sending is idempotent: the API replaces the
	 * subscription for the current token.
	 */
	async refresh(): Promise<void> {
		if (!this.supported) return;
		try {
			const registration = await navigator.serviceWorker.getRegistration('/');
			const subscription = await registration?.pushManager.getSubscription();
			if (!subscription) {
				this.enabled = false;
				return;
			}
			await this.saveSubscription(subscription);
			this.enabled = true;
			this.error = null;
			this.needsRelogin = false;
		} catch (err) {
			this.enabled = false;
			if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
				this.needsRelogin = true;
			}
		}
	}

	async enable(): Promise<void> {
		if (this.busy || !this.supported) return;
		this.busy = true;
		this.error = null;
		this.needsRelogin = false;
		try {
			const permission =
				Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
			if (permission !== 'granted') {
				throw new Error('Benachrichtigungen wurden nicht erlaubt.');
			}

			await navigator.serviceWorker.register(SW_PATH);
			const registration = await navigator.serviceWorker.ready;

			let subscription = await registration.pushManager.getSubscription();
			if (!subscription) {
				const publicKey = await this.vapidKey();
				subscription = await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: urlBase64ToUint8Array(publicKey)
				});
			}

			await this.saveSubscription(subscription);
			this.enabled = true;
		} catch (err) {
			this.error = this.describe(err);
			this.needsRelogin = err instanceof ApiError && (err.status === 401 || err.status === 403);
		} finally {
			this.busy = false;
		}
	}

	async disable(): Promise<void> {
		if (this.busy || !this.supported) return;
		this.busy = true;
		this.error = null;
		this.needsRelogin = false;
		try {
			const registration = await navigator.serviceWorker.getRegistration('/');
			const subscription = await registration?.pushManager.getSubscription();
			// Drop the server-side record first; if that fails (e.g. stale
			// token) still tear down the browser subscription so the user is
			// not stuck with notifications they cannot switch off.
			try {
				await apiRequest<void>(SUBSCRIPTION_PATH, { method: 'DELETE' });
			} catch {
				// best effort
			}
			await subscription?.unsubscribe();
			this.enabled = false;
		} catch (err) {
			this.error = this.describe(err);
		} finally {
			this.busy = false;
		}
	}

	private async vapidKey(): Promise<string> {
		const instance = await apiRequest<InstanceV2>('/api/v2/instance');
		const key = instance.configuration?.vapid?.public_key;
		if (!key) throw new Error('Die Instanz stellt keinen Web-Push-Schlüssel bereit.');
		return key;
	}

	private saveSubscription(subscription: PushSubscription): Promise<unknown> {
		const json = subscription.toJSON();
		return apiRequest(SUBSCRIPTION_PATH, {
			method: 'POST',
			body: {
				subscription: {
					endpoint: json.endpoint,
					keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth }
				},
				data: {
					alerts: {
						follow: true,
						follow_request: true,
						favourite: true,
						mention: true,
						reblog: true,
						poll: true,
						update: true,
						status: true
					},
					policy: 'all'
				}
			}
		});
	}

	private describe(err: unknown): string {
		if (err instanceof ApiError) {
			if (err.status === 401 || err.status === 403) {
				return 'Dein Login ist zu alt für Push-Benachrichtigungen. Bitte melde dich einmal neu an.';
			}
			return err.message;
		}
		return err instanceof Error
			? err.message
			: 'Push-Benachrichtigungen konnten nicht geändert werden.';
	}
}

export const pushStore = new PushStore();

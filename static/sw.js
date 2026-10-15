/*
 * Phosphor service worker.
 *
 * This worker exists ONLY to receive Web Push notifications from GoToSocial
 * and to open the app when a notification is tapped. It deliberately does no
 * caching, so Phosphor keeps working as a plain online SPA (no offline mode).
 *
 * GoToSocial posts a JSON payload shaped like `model.WebPushNotification`
 * (see internal/api/model/webpushnotification.go):
 *   { notification_id, notification_type, title, body, icon,
 *     preferred_locale, access_token }
 */

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
	let data;
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		// Not JSON — fall back to plain text.
		data = { title: 'Phosphor', body: event.data ? event.data.text() : '' };
	}

	const title = data.title || 'Phosphor';
	const notificationId = data.notification_id || undefined;

	event.waitUntil(
		self.registration.showNotification(title, {
			body: data.body || '',
			icon: data.icon || '/icon-192.png',
			badge: '/icon-192.png',
			// Re-use the same tag so a follow-up for the same notification
			// replaces the previous one instead of stacking.
			tag: notificationId,
			data: { url: '/notifications' }
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || '/';

	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			for (const client of windows) {
				if ('focus' in client) {
					await client.focus();
					if ('navigate' in client) await client.navigate(url);
					return;
				}
			}
			await self.clients.openWindow(url);
		})()
	);
});

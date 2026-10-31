/*
 * Phosphor service worker.
 *
 * Two jobs:
 *
 * 1. Web Push — receive GoToSocial notifications and open the app when one is
 *    tapped. GoToSocial posts a JSON payload shaped like
 *    `model.WebPushNotification`
 *    (see internal/api/model/webpushnotification.go):
 *      { notification_id, notification_type, title, body, icon,
 *        preferred_locale, access_token }
 *
 * 2. Offline app shell — cache the built SPA (index.html, hashed bundles,
 *    icons) so a launch without network still boots. Timeline payloads are
 *    *not* cached here: those live in localStorage (see `utils/offline.ts`),
 *    scoped per account and cleared on logout. This worker never sees the
 *    access token or API responses.
 *
 * The build script (`scripts/sw-manifest.mjs`) writes `/sw-manifest.json` with
 * every emitted file and replaces `__PHOSPHOR_VERSION__` below with a content
 * hash, so each deploy installs a fresh cache and drops the previous one.
 */

const VERSION = '__PHOSPHOR_VERSION__';
const SHELL_CACHE = `phosphor-shell-${VERSION}`;

/** Files every install tries to cache even if the manifest is unavailable. */
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

/**
 * Put a request in the shell cache, ignoring individual failures: a single
 * missing optional file must not abort the whole install.
 */
async function precache(cache, url) {
	try {
		const response = await fetch(new Request(url, { cache: 'reload' }));
		if (response.ok) await cache.put(url, response);
	} catch {
		// Offline during install, or an optional file that no longer exists.
	}
}

self.addEventListener('install', (event) => {
	self.skipWaiting();
	event.waitUntil(
		(async () => {
			const cache = await caches.open(SHELL_CACHE);
			await Promise.all(CORE.map((url) => precache(cache, url)));

			try {
				const response = await fetch('/sw-manifest.json', { cache: 'no-cache' });
				if (!response.ok) return;
				const manifest = await response.json();
				if (!Array.isArray(manifest.files)) return;
				await Promise.all(manifest.files.map((url) => precache(cache, url)));
			} catch {
				// No manifest (e.g. a hand-run dev build): the runtime cache below
				// still fills in the assets the app actually asks for.
			}
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => key.startsWith('phosphor-shell-') && key !== SHELL_CACHE)
					.map((key) => caches.delete(key))
			);
			await self.clients.claim();
		})()
	);
});

/**
 * Cache lookups ignore `Vary`. The preview server and some static hosts add
 * `Vary: Origin`; a module-script request and the precache request can then
 * carry different headers even though the URL is content-hashed and immutable.
 */
function matchCached(request) {
	return caches.match(request, { ignoreVary: true });
}

/** Hashed bundles are immutable, so a cache hit is always correct. */
async function cacheFirst(request) {
	const cached = await matchCached(request);
	if (cached) return cached;

	const response = await fetch(request);
	if (response.ok) {
		const cache = await caches.open(SHELL_CACHE);
		await cache.put(request, response.clone());
	}
	return response;
}

/** Navigation: always try the network, fall back to the cached SPA shell. */
async function networkFirstNavigation(request) {
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(SHELL_CACHE);
			await cache.put('/index.html', response.clone());
		}
		return response;
	} catch {
		const cached =
			(await matchCached('/index.html')) ??
			(await matchCached('/')) ??
			(await matchCached(request));
		if (cached) return cached;

		return new Response(
			'<!doctype html><meta charset="utf-8"><title>Phosphor</title><p>Offline. Open Phosphor once with a connection to make it available offline.</p>',
			{ status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
		);
	}
}

/** Icons and the manifest: serve the cache, refresh it in the background. */
async function staleWhileRevalidate(request) {
	const cached = await matchCached(request);
	const network = fetch(request)
		.then(async (response) => {
			if (response.ok) {
				const cache = await caches.open(SHELL_CACHE);
				await cache.put(request, response.clone());
			}
			return response;
		})
		.catch(() => null);

	return cached ?? (await network) ?? Response.error();
}

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	let url;
	try {
		url = new URL(request.url);
	} catch {
		return;
	}

	// Only same-origin app files. API calls go to the GoToSocial instance and
	// must never be cached by the worker.
	if (url.origin !== self.location.origin) return;
	if (url.pathname === '/sw.js' || url.pathname === '/sw-manifest.json') return;

	if (request.mode === 'navigate') {
		event.respondWith(networkFirstNavigation(request));
		return;
	}

	if (url.pathname.startsWith('/_app/')) {
		event.respondWith(cacheFirst(request));
		return;
	}

	if (CORE.includes(url.pathname)) {
		event.respondWith(staleWhileRevalidate(request));
	}
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

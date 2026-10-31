// Prüft den Offline-Start: App-Shell und Bundles kommen aus dem Service
// Worker, die zuletzt geladenen Beiträge aus dem lokalen Cache. Beim Wechsel
// zurück ins Netz verschwindet der Offline-Hinweis wieder.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4174';

const ACCOUNT = {
	id: 'me',
	username: 'tester',
	acct: 'tester',
	display_name: 'Tester',
	locked: false,
	bot: false,
	created_at: '2024-01-01T00:00:00Z',
	note: '',
	url: 'https://social.janmontag.de/@tester',
	avatar: '',
	avatar_static: '',
	header: '',
	header_static: '',
	followers_count: 1,
	following_count: 1,
	statuses_count: 1,
	last_status_at: null,
	emojis: [],
	fields: []
};

function status(id, content) {
	return {
		id,
		created_at: '2026-01-01T00:00:00Z',
		edited_at: null,
		in_reply_to_id: null,
		in_reply_to_account_id: null,
		sensitive: false,
		spoiler_text: '',
		visibility: 'public',
		language: 'de',
		uri: `https://social.janmontag.de/users/tester/statuses/${id}`,
		url: `https://social.janmontag.de/@tester/${id}`,
		replies_count: 0,
		reblogs_count: 0,
		favourites_count: 0,
		content,
		reblog: null,
		account: ACCOUNT,
		media_attachments: [],
		mentions: [],
		tags: [],
		emojis: [],
		card: null,
		poll: null,
		favourited: false,
		reblogged: false,
		bookmarked: false
	};
}

const STATUSES = [
	status('offline1', '<p>OFFLINE-BESTAND ist im Cache.</p>'),
	status('offline2', '<p>Zweiter Offline-Beitrag.</p>')
];

const checks = [];
function check(name, ok, detail = '') {
	checks.push(ok);
	console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

(async () => {
	const browser = await chromium.launch({
		...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
		args: ['--no-sandbox']
	});
	const context = await browser.newContext({
		locale: 'de-DE',
		viewport: { width: 900, height: 900 }
	});

	await context.route('**/api/**', (route) => {
		const path = new URL(route.request().url()).pathname;
		const json = (body) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

		if (path === '/api/v1/accounts/verify_credentials') return json(ACCOUNT);
		if (path === '/api/v2/instance') {
			return json({
				configuration: {
					statuses: { max_characters: 5000, max_media_attachments: 6 },
					media_attachments: {}
				}
			});
		}
		if (path === '/api/v1/timelines/home') return json(STATUSES);
		return json([]);
	});

	const page = await context.newPage();
	const pageErrors = [];
	page.on('pageerror', (err) => {
		pageErrors.push(String(err));
		console.log('[pageerror]', String(err).slice(0, 200));
	});
	await page.addInitScript(() => {
		// Nur beim ersten Besuch setzen: ab dann persistiert die App die
		// Session selbst (inklusive Profil) und darf sie nicht überschrieben
		// bekommen.
		if (!localStorage.getItem('phosphor:session:v1')) {
			const app = { client_id: 'x', client_secret: 'y', redirect_uri: '', scopes: '' };
			localStorage.setItem(
				'phosphor:session:v1',
				JSON.stringify({ app, token: 'test-token', instance: 'https://social.janmontag.de' })
			);
		}

		// Kein echter WebSocket im Test: die App soll nicht gegen die
		// (gefälschte) Instanz reconnecten.
		class FakeWebSocket {
			static CONNECTING = 0;
			static OPEN = 1;
			static CLOSING = 2;
			static CLOSED = 3;

			constructor() {
				this.readyState = FakeWebSocket.CONNECTING;
				setTimeout(() => {
					this.readyState = FakeWebSocket.OPEN;
					this.onopen?.({});
				}, 0);
			}

			send() {}

			close() {
				this.readyState = FakeWebSocket.CLOSED;
				this.onclose?.({});
			}
		}
		window.WebSocket = FakeWebSocket;
	});

	await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
	await page.getByText('OFFLINE-BESTAND ist im Cache.').waitFor({ timeout: 10_000 });
	check('Beitrag online geladen', true);

	const shellCached = await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
		const names = await caches.keys();
		if (!names.length) return false;
		const cache = await caches.open(names[0]);
		return (await cache.match('/')) !== undefined;
	});
	check('App-Shell im Service-Worker-Cache', shellCached === true);

	await context.setOffline(true);
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.getByText('OFFLINE-BESTAND ist im Cache.').waitFor({ timeout: 10_000 });

	check(
		'Offline-Hinweis sichtbar',
		(await page.getByText(/Offline — du siehst zuletzt geladene Inhalte/).count()) === 1
	);
	check(
		'Angemeldet trotz fehlender Verbindung',
		(await page.getByRole('heading', { name: 'Start', exact: true }).count()) === 1
	);
	check(
		'Beitrag aus dem lokalen Cache',
		(await page.getByText('OFFLINE-BESTAND ist im Cache.').count()) === 1
	);

	// Ein tiefer Link muss offline ebenfalls booten: der Service Worker
	// liefert die SPA-Hülle, die Bundles kommen aus dem Precache.
	await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
	await page.getByRole('heading', { name: 'Einstellungen', exact: true }).waitFor({
		timeout: 10_000
	});
	check('Tiefer Link offline erreichbar', true);

	await context.setOffline(false);
	await page.waitForTimeout(600);
	check(
		'Offline-Hinweis verschwindet wieder',
		(await page.getByText(/Offline — du siehst zuletzt geladene Inhalte/).count()) === 0
	);

	await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
	await page.getByText('OFFLINE-BESTAND ist im Cache.').waitFor({ timeout: 10_000 });
	check('Wieder online nutzbar', true);
	check('Keine unbehandelten Seitenfehler', pageErrors.length === 0, String(pageErrors.length));

	console.log(`\n${checks.filter(Boolean).length}/${checks.length} Checks bestanden`);
	await browser.close();
	process.exit(checks.every(Boolean) ? 0 : 1);
})();

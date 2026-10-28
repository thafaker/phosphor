// Prüft, dass neue Stream-Beiträge und -Meldungen die Leseposition nicht
// verschieben: Sie werden gepuffert, ein Hinweis erscheint, erst ein Klick
// (oder Scrollen an den Anfang) fügt sie oben ein.
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
	statuses_count: 20,
	last_status_at: null,
	emojis: [],
	fields: []
};

function status(id, content, createdAt) {
	return {
		id,
		created_at: createdAt,
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

const LONG = 'Das ist ein längerer Testbeitrag, damit die Timeline sicher scrollbar ist. '.repeat(
	4
);
const STATUSES = Array.from({ length: 20 }, (_, index) =>
	status(
		`s${index + 1}`,
		`<p>BESTAND-${index + 1}. ${LONG}</p>`,
		`2026-01-01T00:00:${String(index).padStart(2, '0')}Z`
	)
);

const NEW_1 = status('neu1', '<p>NEU-1 ist da.</p>', '2026-01-02T00:00:01Z');
const NEW_2 = status('neu2', '<p>NEU-2 ist da.</p>', '2026-01-02T00:00:02Z');
const NEW_3 = status('neu3', '<p>NEU-3 ist da.</p>', '2026-01-02T00:00:03Z');

const NOTIFICATIONS = Array.from({ length: 30 }, (_, index) => ({
	id: `n${index + 1}`,
	type: 'mention',
	created_at: `2026-01-01T00:00:${String(index).padStart(2, '0')}Z`,
	account: {
		...ACCOUNT,
		id: `na${index + 1}`,
		username: `user${index + 1}`,
		acct: `user${index + 1}`,
		display_name: `Meldung ${index + 1}`
	},
	status: null
}));

const NEW_NOTIFICATION = {
	id: 'stream-notification',
	type: 'mention',
	created_at: '2026-01-02T00:00:01Z',
	account: {
		...ACCOUNT,
		id: 'stream-account',
		username: 'stream',
		acct: 'stream',
		display_name: 'NEU-MELDUNG'
	},
	status: null
};

const checks = [];
function check(name, ok, detail = '') {
	checks.push(ok);
	console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function scrollState(page, articleIndex = 5) {
	return page.evaluate((index) => {
		const article = document.querySelectorAll('article')[index];
		return {
			scrollY: window.scrollY,
			top: article ? article.getBoundingClientRect().top : null
		};
	}, articleIndex);
}

(async () => {
	const browser = await chromium.launch({
		...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
		args: ['--no-sandbox']
	});
	const context = await browser.newContext({ viewport: { width: 900, height: 900 } });

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
		if (path === '/api/v1/notifications') return json(NOTIFICATIONS);
		return json([]);
	});

	const page = await context.newPage();
	page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 200)));
	await page.addInitScript(() => {
		// Fake-Socket: Die App verbindet sich normal, der Test kann Events
		// gezielt auslösen. STATIC readyStates werden von Streamer/Stream gelesen.
		class FakeWebSocket {
			static CONNECTING = 0;
			static OPEN = 1;
			static CLOSING = 2;
			static CLOSED = 3;

			constructor(url) {
				this.url = url;
				this.readyState = FakeWebSocket.CONNECTING;
				this.onopen = null;
				this.onmessage = null;
				this.onclose = null;
				this.onerror = null;
				window.__ws = this;
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

			emit(event, payload) {
				this.onmessage?.({ data: JSON.stringify({ stream: ['user'], event, payload }) });
			}
		}

		window.WebSocket = FakeWebSocket;
		const app = { client_id: 'x', client_secret: 'y', redirect_uri: '', scopes: '' };
		localStorage.setItem(
			'phosphor:session:v1',
			JSON.stringify({ app, token: 'test-token', instance: 'https://social.janmontag.de' })
		);
	});

	await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
	await page.waitForFunction(() => window.__ws?.readyState === 1);
	await page.waitForTimeout(800);

	check('Timeline geladen', (await page.locator('article').count()) >= 20);

	await page.locator('article').nth(5).scrollIntoViewIfNeeded();
	await page.evaluate(() => window.scrollBy(0, 200));
	await page.waitForTimeout(200);
	const before = await scrollState(page);
	check('Testposition ist gescrollt', before.scrollY > 150, `${before.scrollY}px`);

	await page.evaluate((newStatus) => window.__ws.emit('update', newStatus), NEW_1);
	await page.waitForTimeout(400);

	const after = await scrollState(page);
	check(
		'Scrollposition bleibt stehen',
		Math.abs(after.scrollY - before.scrollY) <= 1,
		`${before.scrollY} → ${after.scrollY}`
	);
	check(
		'sichtbarer Beitrag bleibt an Ort und Stelle',
		Math.abs(after.top - before.top) <= 1,
		`${before.top} → ${after.top}`
	);
	check(
		'Hinweis auf neuen Beitrag',
		(await page.getByRole('button', { name: /1 neuer Beitrag/ }).count()) === 1
	);
	check(
		'neuer Beitrag noch nicht eingefügt',
		(await page.getByText('NEU-1 ist da.', { exact: true }).count()) === 0
	);

	await page.getByRole('button', { name: /1 neuer Beitrag/ }).click();
	await page.waitForTimeout(300);
	check('Klick springt an den Anfang', (await page.evaluate(() => window.scrollY)) < 4);
	check(
		'neuer Beitrag ist sichtbar',
		await page.getByText('NEU-1 ist da.', { exact: true }).isVisible()
	);
	check(
		'Hinweis nach dem Einfügen weg',
		(await page.getByRole('button', { name: /neuer Beitrag/ }).count()) === 0
	);

	await page.evaluate((newStatus) => window.__ws.emit('update', newStatus), NEW_2);
	await page.waitForTimeout(400);
	check(
		'am Anfang wird sofort eingefügt',
		await page.getByText('NEU-2 ist da.', { exact: true }).isVisible()
	);
	check(
		'am Anfang erscheint kein Hinweis',
		(await page.getByRole('button', { name: /neuer Beitrag/ }).count()) === 0
	);

	await page.evaluate(() => window.scrollTo(0, 900));
	await page.waitForTimeout(200);
	check('erneut gescrollt', (await page.evaluate(() => window.scrollY)) > 100);
	await page.evaluate((newStatus) => window.__ws.emit('update', newStatus), NEW_3);
	await page.waitForTimeout(400);
	check(
		'Hinweis nach erneutem Scrollen',
		(await page.getByRole('button', { name: /1 neuer Beitrag/ }).count()) === 1
	);

	await page.evaluate(() => window.scrollTo(0, 0));
	await page.waitForTimeout(400);
	check(
		'manuelles Hochscrollen fügt gepufferte Beiträge ein',
		await page.getByText('NEU-3 ist da.', { exact: true }).isVisible()
	);
	check(
		'Hinweis nach manuellem Hochscrollen weg',
		(await page.getByRole('button', { name: /neuer Beitrag/ }).count()) === 0
	);

	// --- Meldungen: gleicher Mechanismus ---------------------------------
	await page.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(800);
	check('Meldungen geladen', (await page.getByText('Meldung 1', { exact: true }).count()) >= 1);

	await page.evaluate(() => window.scrollTo(0, 700));
	await page.waitForTimeout(200);
	const notificationsY = await page.evaluate(() => window.scrollY);
	check('Meldungen sind gescrollt', notificationsY > 100, `${notificationsY}px`);

	await page.evaluate(
		(newNotification) => window.__ws.emit('notification', newNotification),
		NEW_NOTIFICATION
	);
	await page.waitForTimeout(400);
	check(
		'Meldungs-Scrollposition bleibt stehen',
		Math.abs((await page.evaluate(() => window.scrollY)) - notificationsY) <= 1
	);
	check(
		'Hinweis auf neue Meldung',
		(await page.getByRole('button', { name: /1 neue Meldung/ }).count()) === 1
	);
	check(
		'neue Meldung noch nicht eingefügt',
		(await page.getByText('NEU-MELDUNG', { exact: true }).count()) === 0
	);

	await page.getByRole('button', { name: /1 neue Meldung/ }).click();
	await page.waitForTimeout(300);
	check('Meldungs-Klick springt an den Anfang', (await page.evaluate(() => window.scrollY)) < 4);
	check(
		'neue Meldung ist sichtbar',
		await page.getByText('NEU-MELDUNG', { exact: true }).isVisible()
	);

	await browser.close();
	const failed = checks.filter((ok) => !ok).length;
	console.log(`\n${checks.length - failed}/${checks.length} Checks bestanden`);
	process.exit(failed ? 1 : 0);
})();

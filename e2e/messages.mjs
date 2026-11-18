// Prüft den Direktnachrichten-Posteingang: Übersicht nach Namen, Lesen,
// Entfernen und das Starten einer neuen Nachricht.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4174';

const ME = {
	id: 'me',
	username: 'tester',
	acct: 'tester',
	display_name: 'Tester',
	locked: false,
	bot: false,
	created_at: '2024-01-01T00:00:00Z',
	note: '',
	url: 'https://social.example/@tester',
	avatar: '',
	avatar_static: '',
	header: '',
	header_static: '',
	followers_count: 0,
	following_count: 0,
	statuses_count: 0,
	last_status_at: null,
	emojis: [],
	fields: [],
	source: { status_content_type: 'text/plain' }
};

function account(id, name, acct = name.toLowerCase()) {
	return {
		...ME,
		id,
		username: acct,
		acct,
		display_name: name,
		url: `https://social.example/@${acct}`
	};
}

const ALICE = account('a1', 'Alice');
const BOB = account('b1', 'Bob', 'bob@remote.test');

function directStatus(id, author, content, extra = {}) {
	return {
		id,
		created_at: extra.created_at ?? '2026-01-01T10:00:00Z',
		edited_at: null,
		in_reply_to_id: extra.in_reply_to_id ?? null,
		in_reply_to_account_id: extra.in_reply_to_account_id ?? null,
		sensitive: false,
		spoiler_text: '',
		visibility: 'direct',
		language: 'de',
		uri: `https://social.example/statuses/${id}`,
		url: `https://social.example/@${author.acct}/${id}`,
		replies_count: 0,
		reblogs_count: 0,
		favourites_count: 0,
		content: `<p>${content}</p>`,
		reblog: null,
		account: author,
		media_attachments: [],
		mentions: extra.mentions ?? [],
		tags: [],
		emojis: [],
		card: null,
		poll: null,
		favourited: false,
		reblogged: false,
		bookmarked: false
	};
}

const STATUS_ALICE = directStatus('s1', ALICE, 'Hallo von Alice', {
	created_at: '2026-01-01T10:00:00Z',
	mentions: [
		{ id: 'me', username: 'tester', url: 'https://social.example/@tester', acct: 'tester' }
	]
});
const STATUS_BOB = directStatus('s2', BOB, 'Gruppennachricht', {
	created_at: '2026-01-01T09:00:00Z',
	mentions: [
		{ id: 'me', username: 'tester', url: 'https://social.example/@tester', acct: 'tester' },
		{ id: 'a1', username: 'alice', url: 'https://social.example/@alice', acct: 'alice' }
	]
});

let conversations = [
	{ id: 'c1', accounts: [ALICE], unread: true, last_status: STATUS_ALICE },
	{ id: 'c2', accounts: [BOB, ALICE], unread: false, last_status: STATUS_BOB }
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

	let postedBody = null;

	await context.route('**/api/**', async (route) => {
		const req = route.request();
		const url = new URL(req.url());
		const path = url.pathname;
		const json = (body, status = 200) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

		if (path === '/api/v1/accounts/verify_credentials') return json(ME);
		if (path === '/api/v2/instance') {
			return json({
				configuration: {
					statuses: { max_characters: 5000, max_media_attachments: 6 },
					media_attachments: {}
				}
			});
		}
		if (path === '/api/v1/conversations' && req.method() === 'GET') return json(conversations);
		if (path === '/api/v1/conversations/c1/read' && req.method() === 'POST') {
			conversations = conversations.map((c) => (c.id === 'c1' ? { ...c, unread: false } : c));
			return json(conversations.find((c) => c.id === 'c1'));
		}
		if (path === '/api/v1/conversations/c2' && req.method() === 'DELETE') {
			conversations = conversations.filter((c) => c.id !== 'c2');
			return json({});
		}
		if (path === '/api/v2/search') {
			const q = (url.searchParams.get('q') || '').toLowerCase();
			const accounts = q.includes('ali') ? [ALICE] : q.includes('bob') ? [BOB] : [];
			return json({ accounts, statuses: [], hashtags: [] });
		}
		if (path === '/api/v1/statuses' && req.method() === 'POST') {
			postedBody = JSON.parse(req.postData() || '{}');
			const created = directStatus('s-new', ME, postedBody.status || '', {
				created_at: '2026-01-01T11:00:00Z',
				mentions: [
					{ id: 'a1', username: 'alice', url: 'https://social.example/@alice', acct: 'alice' }
				]
			});
			conversations = [
				{ id: 'c-new', accounts: [ALICE], unread: false, last_status: created },
				...conversations
			];
			return json(created);
		}
		if (path === '/api/v1/statuses/s1') return json(STATUS_ALICE);
		if (path === '/api/v1/statuses/s1/context') return json({ ancestors: [], descendants: [] });

		return json([]);
	});

	const page = await context.newPage();
	const pageErrors = [];
	page.on('pageerror', (err) => {
		pageErrors.push(String(err));
		console.log('[pageerror]', String(err).slice(0, 200));
	});

	await page.addInitScript(() => {
		const app = { client_id: 'x', client_secret: 'y', redirect_uri: '', scopes: '' };
		localStorage.setItem(
			'phosphor:session:v1',
			JSON.stringify({ app, token: 'test-token', instance: 'https://social.example' })
		);
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

	await page.goto(`${BASE}/messages`, { waitUntil: 'networkidle' });
	await page
		.getByRole('heading', { name: 'Nachrichten', exact: true })
		.waitFor({ timeout: 10_000 });
	await page.waitForTimeout(600);

	const items = page.locator('ul > li');
	check('2 Unterhaltungen geladen', (await items.count()) === 2, String(await items.count()));
	check('Teilnehmername sichtbar', (await page.getByText('Alice').count()) >= 1);
	check('Gruppen-Teilnehmer sichtbar', (await page.getByText(/Bob/).count()) >= 1);
	check('Vorschau sichtbar', (await page.getByText('Hallo von Alice').count()) >= 1);
	check(
		'Ungelesen markiert',
		(await page.locator('[title="Ungelesen"]').count()) === 1,
		String(await page.locator('[title="Ungelesen"]').count())
	);

	// Klick öffnet den Thread und markiert gelesen.
	await page.getByRole('button', { name: /Alice/ }).first().click();
	await page.waitForURL(/\/status\/s1/, { timeout: 10_000 });
	check('Öffnet letzten Status', page.url().includes('/status/s1'));

	await page.goto(`${BASE}/messages`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(600);
	check(
		'Nach Öffnen gelesen',
		(await page.locator('[title="Ungelesen"]').count()) === 0,
		String(await page.locator('[title="Ungelesen"]').count())
	);

	// Unterhaltung entfernen.
	const deleteButtons = page.getByRole('button', { name: 'Unterhaltung entfernen' });
	await deleteButtons.last().click();
	await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click();
	await page.waitForTimeout(500);
	check('Unterhaltung entfernt', (await items.count()) === 1, String(await items.count()));

	// Neue Nachricht starten.
	await page.getByRole('button', { name: 'Neue Nachricht' }).click();
	await page.getByPlaceholder('Person suchen…').fill('ali');
	await page.waitForTimeout(500);
	await page
		.locator('ul')
		.filter({ has: page.getByText('@alice') })
		.getByRole('button', { name: /Alice/ })
		.click();
	await page.waitForTimeout(200);
	check('Empfänger ausgewählt', (await page.getByText('@alice', { exact: true }).count()) >= 1);

	const composer = page.getByPlaceholder('Was gibt es Neues?');
	await composer.fill('@alice Neue Direktnachricht');
	await page.getByRole('button', { name: 'Posten' }).click();
	await page.waitForTimeout(1000);
	check('Direktnachricht gesendet', postedBody?.visibility === 'direct', postedBody?.visibility);
	check(
		'Empfänger im Text',
		typeof postedBody?.status === 'string' && postedBody.status.includes('@alice'),
		postedBody?.status
	);

	check('Keine unbehandelten Seitenfehler', pageErrors.length === 0, String(pageErrors.length));

	console.log(`\n${checks.filter(Boolean).length}/${checks.length} Checks bestanden`);
	await browser.close();
	process.exit(checks.every(Boolean) ? 0 : 1);
})();

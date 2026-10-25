// Prüft, dass Erwähnungen im Beitragstext intern auf Profile verlinken und
// unbekannte Erwähnungen weiterhin zur Herkunftsinstanz führen.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4174';

const REMOTE = {
	id: 'remote1',
	username: 'alice',
	acct: 'alice@remote.example',
	display_name: 'Alice',
	locked: false,
	bot: false,
	created_at: '2024-01-01T00:00:00Z',
	note: '<p>Hallo von Alice.</p>',
	url: 'https://remote.example/@alice',
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

const ME = {
	...REMOTE,
	id: 'me',
	username: 'me',
	acct: 'me',
	display_name: 'Ich',
	url: 'https://social.janmontag.de/@me'
};

const STATUS = {
	id: 's1',
	created_at: '2026-01-01T00:00:00Z',
	edited_at: null,
	in_reply_to_id: null,
	in_reply_to_account_id: null,
	sensitive: false,
	spoiler_text: '',
	visibility: 'public',
	language: 'de',
	uri: 'https://remote.example/users/alice/statuses/1',
	url: 'https://remote.example/@alice/statuses/1',
	replies_count: 0,
	reblogs_count: 0,
	favourites_count: 0,
	content: [
		'<p>Hallo',
		'<span class="h-card"><a href="https://social.janmontag.de/@me" class="u-url mention" rel="nofollow noreferrer noopener" target="_blank">@<span>me</span></a></span>,',
		'<span class="h-card"><a href="https://remote.example/@alice" class="u-url mention" rel="nofollow noreferrer noopener" target="_blank">@<span>alice</span></a></span>',
		'und',
		'<span class="h-card"><a href="https://elsewhere.example/@bob" class="u-url mention" rel="nofollow noreferrer noopener" target="_blank">@<span>bob</span></a></span>.</p>'
	].join(' '),
	reblog: null,
	account: REMOTE,
	media_attachments: [],
	mentions: [
		{ id: 'me', username: 'me', acct: 'me', url: 'https://social.janmontag.de/@me' },
		{
			id: 'remote1',
			username: 'alice',
			// Absichtlich die URL der eigenen Instanz, während der Anchor auf die
			// Herkunftsinstanz zeigt: deckt den Fallback über die Anchor-URL ab.
			acct: 'alice@remote.example',
			url: 'https://social.janmontag.de/@alice@remote.example'
		}
	],
	tags: [],
	emojis: [],
	card: null,
	poll: null,
	favourited: false,
	reblogged: false,
	bookmarked: false
};

const RELATIONSHIP = {
	id: 'remote1',
	following: false,
	showing_reblogs: true,
	notifying: false,
	followed_by: false,
	blocking: false,
	blocked_by: false,
	muting: false,
	muting_notifications: false,
	requested: false,
	requested_by: false,
	domain_blocking: false,
	endorsed: false,
	note: ''
};

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
	const context = await browser.newContext({ viewport: { width: 900, height: 900 } });

	await context.route('**/api/**', (route) => {
		const path = new URL(route.request().url()).pathname;
		const json = (body) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

		if (path === '/api/v1/accounts/verify_credentials') return json(ME);
		if (path === '/api/v2/instance') {
			return json({
				configuration: {
					statuses: { max_characters: 5000, max_media_attachments: 6 },
					media_attachments: {}
				}
			});
		}
		if (path === '/api/v1/timelines/home') return json([STATUS]);
		if (path === '/api/v1/accounts/remote1') return json(REMOTE);
		if (path === '/api/v1/accounts/relationships') return json([RELATIONSHIP]);
		if (path === '/api/v1/accounts/remote1/statuses') return json([STATUS]);
		return json([]);
	});

	const page = await context.newPage();
	page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 200)));
	await page.addInitScript(() => {
		const app = { client_id: 'x', client_secret: 'y', redirect_uri: '', scopes: '' };
		localStorage.setItem(
			'phosphor:session:v1',
			JSON.stringify({ app, token: 'test-token', instance: 'https://social.janmontag.de' })
		);
	});

	await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(600);

	const localMention = page.getByRole('link', { name: '@me', exact: true });
	const remoteMention = page.getByRole('link', {
		name: '@alice',
		exact: true
	});
	const unknownMention = page.getByRole('link', {
		name: '@bob',
		exact: true
	});

	check(
		'lokale Erwähnung verlinkt intern',
		(await localMention.getAttribute('href')) === '/accounts/me'
	);
	check('lokale Erwähnung bleibt in der App', (await localMention.getAttribute('target')) === null);
	check(
		'entfernte Erwähnung verlinkt intern',
		(await remoteMention.getAttribute('href')) === '/accounts/remote1',
		String(await remoteMention.getAttribute('href'))
	);
	check(
		'entfernte Erwähnung bleibt in der App',
		(await remoteMention.getAttribute('target')) === null
	);

	check(
		'unbekannte Erwähnung zeigt auf die Herkunftsinstanz',
		(await unknownMention.getAttribute('href')) === 'https://elsewhere.example/@bob',
		String(await unknownMention.getAttribute('href'))
	);
	check(
		'unbekannte Erwähnung öffnet einen neuen Tab',
		(await unknownMention.getAttribute('target')) === '_blank'
	);

	await remoteMention.click();
	await page.waitForURL('**/accounts/remote1');
	await page.waitForTimeout(600);
	check(
		'Klick auf Erwähnung bleibt in Phosphor',
		new URL(page.url()).pathname === '/accounts/remote1',
		page.url()
	);
	check(
		'Profil der erwähnten Person geladen',
		(await page.getByRole('heading', { name: 'Alice', exact: true }).count()) === 1
	);

	await browser.close();
	const failed = checks.filter((ok) => !ok).length;
	console.log(`\n${checks.length - failed}/${checks.length} Checks bestanden`);
	process.exit(failed ? 1 : 0);
})();

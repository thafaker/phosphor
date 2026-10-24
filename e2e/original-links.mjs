// Prüft die Links auf die Original-Instanz: Profil und Beitrag öffnen sowie
// den jeweiligen Link in die Zwischenablage kopieren (Teilen/Embedden).
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
	content: '<p>Hallo Welt</p>',
	reblog: null,
	account: REMOTE,
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

	await context.addInitScript(() => {
		// Clipboard stub: headless Chromium has no usable clipboard permission.
		window.__copied = [];
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: async (text) => window.__copied.push(text) }
		});
	});

	await context.route('**/api/**', (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
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

	const statusLink = page.getByRole('link', {
		name: 'Originalbeitrag auf remote.example öffnen'
	});
	check('Beitragslink vorhanden', (await statusLink.count()) === 1);
	check(
		'Beitragslink zeigt auf die Herkunftsinstanz',
		(await statusLink.getAttribute('href')) === STATUS.url,
		String(await statusLink.getAttribute('href'))
	);
	check('Beitragslink öffnet neuen Tab', (await statusLink.getAttribute('target')) === '_blank');

	const statusCopy = page.getByRole('button', {
		name: 'Link zum Originalbeitrag kopieren (remote.example)'
	});
	await statusCopy.click();
	await page.waitForTimeout(150);
	check('Kopier-Rückmeldung am Beitrag', (await page.getByText('Kopiert').count()) >= 1);
	const copiedStatus = await page.evaluate(() => window.__copied);
	check(
		'Beitrags-URL in der Zwischenablage',
		copiedStatus.includes(STATUS.url),
		JSON.stringify(copiedStatus)
	);

	await page.goto(`${BASE}/accounts/remote1`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(600);

	const profileIcon = page.getByRole('link', { name: 'Profil auf remote.example öffnen' });
	check('Profil-Link am Handle', (await profileIcon.count()) === 1);
	check(
		'Profil-Link zeigt auf das Originalprofil',
		(await profileIcon.getAttribute('href')) === REMOTE.url,
		String(await profileIcon.getAttribute('href'))
	);

	const profileText = page.getByRole('link', {
		name: 'Auf remote.example öffnen',
		exact: true
	});
	check('Profil-Link mit Host-Beschriftung', (await profileText.count()) === 1);

	const profileCopy = page.getByRole('button', {
		name: 'Link zum Profil von @alice@remote.example kopieren'
	});
	await profileCopy.click();
	await page.waitForTimeout(150);
	const copiedProfile = await page.evaluate(() => window.__copied);
	check(
		'Profil-URL in der Zwischenablage',
		copiedProfile.includes(REMOTE.url),
		JSON.stringify(copiedProfile)
	);

	await browser.close();
	const failed = checks.filter((ok) => !ok).length;
	console.log(`\n${checks.length - failed}/${checks.length} Checks bestanden`);
	process.exit(failed ? 1 : 0);
})();

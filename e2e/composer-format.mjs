// Prüft den expliziten Textformat-Modus (Markdown/Plain) und den Backslash-
// Roundtrip im Composer sowie das Favicon nach der Hydration.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4174';

const ACCOUNT = {
	id: '1',
	username: 'tester',
	acct: 'tester',
	display_name: 'Tester',
	locked: false,
	bot: false,
	created_at: '2024-01-01T00:00:00Z',
	note: '',
	url: 'http://example.test/@tester',
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
	source: { status_content_type: 'text/markdown' }
};

function statusFrom(text, contentType) {
	return {
		id: '99',
		content: `<p>${text}</p>`,
		content_type: contentType,
		account: ACCOUNT,
		created_at: new Date().toISOString(),
		visibility: 'public',
		media_attachments: [],
		mentions: [],
		tags: [],
		emojis: [],
		favourited: false,
		reblogged: false,
		bookmarked: false,
		muted: false,
		sensitive: false,
		spoiler_text: '',
		replies_count: 0,
		reblogs_count: 0,
		favourites_count: 0,
		url: 'http://example.test/@tester/99',
		uri: 'http://example.test/@tester/99'
	};
}

(async () => {
	const browser = await chromium.launch({
		...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
		args: ['--no-sandbox']
	});
	const context = await browser.newContext();
	const posts = [];

	await context.route('**/api/**', (route) => {
		const req = route.request();
		const url = req.url();
		if (url.includes('verify_credentials')) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(ACCOUNT)
			});
		}
		if (url.includes('/api/v1/statuses') && req.method() === 'POST') {
			const body = JSON.parse(req.postData() || '{}');
			posts.push(body);
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(statusFrom(body.status, body.content_type))
			});
		}
		return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
	});

	const page = await context.newPage();
	const errors = [];
	const checks = [];
	page.on('pageerror', (err) => errors.push(String(err)));
	function check(name, ok, detail = '') {
		checks.push(ok);
		console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
	}
	await page.addInitScript(() => {
		const app = { client_id: 'x', client_secret: 'y', redirect_uri: '', scopes: '' };
		localStorage.setItem(
			'phosphor:session:v1',
			JSON.stringify({ app, token: 'test-token', instance: 'https://social.janmontag.de' })
		);
	});

	await page.goto(BASE, { waitUntil: 'networkidle' });
	await page.waitForTimeout(700);

	const md = page.getByRole('button', { name: /^MD$/ });
	const pressed = await md.getAttribute('aria-pressed');
	check('MD-Vorgabe folgt dem Konto (an)', pressed === 'true', String(pressed));

	const text = 'C:\\Users\\test und "\\" sowie \\*kursiv\\*';
	const textarea = page.locator('textarea').first();
	await textarea.fill(text);
	await page.waitForTimeout(150);
	check(
		'Backslash-Hinweis sichtbar',
		(await page.innerText('body')).includes('Markdown ist aktiv')
	);

	await page.getByRole('button', { name: /Posten/ }).click();
	await page.waitForTimeout(900);
	check(
		'POST 1 sendet text/markdown',
		posts[0]?.content_type === 'text/markdown',
		String(posts[0]?.content_type)
	);
	check('POST 1 Text unverändert', posts[0]?.status === text);

	// Umschalten auf Plaintext: der Backslash muss literal bleiben.
	await md.click();
	await page.waitForTimeout(100);
	const pressedOff = await md.getAttribute('aria-pressed');
	await textarea.fill(text);
	await page.getByRole('button', { name: /Posten/ }).click();
	await page.waitForTimeout(900);
	check('MD-Schalter aus', pressedOff === 'false', String(pressedOff));
	check(
		'POST 2 sendet text/plain',
		posts[1]?.content_type === 'text/plain',
		String(posts[1]?.content_type)
	);
	check('POST 2 Text unverändert', posts[1]?.status === text);
	check(
		'Hinweis bei Plaintext aus',
		!(await page.innerText('body')).includes('Markdown ist aktiv')
	);

	const iconPaths = await page.$$eval('link[rel="icon"]', (els) =>
		els.map((el) => new URL(el.getAttribute('href'), location.origin).pathname)
	);
	check(
		'Favicon ist das Phosphor-Icon',
		iconPaths.includes('/icon.svg') && !iconPaths.some((path) => path.includes('svelte')),
		JSON.stringify(iconPaths)
	);
	check('keine Seitenfehler', errors.length === 0, errors.join(' | '));

	await browser.close();
	const failed = checks.filter((ok) => !ok).length;
	console.log(`\n${checks.length - failed}/${checks.length} Checks bestanden`);
	process.exit(failed ? 1 : 0);
})();

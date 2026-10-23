// Prüft den Custom-Emoji-Picker im Composer (Suche, Einfügen an der Cursorposition).
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4174';
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

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
	source: { status_content_type: 'text/plain' }
};

const EMOJIS = [
	{ shortcode: 'blobcat', url: GIF, static_url: GIF, visible_in_picker: true, category: 'Cats' },
	{
		shortcode: 'partyparrot',
		url: GIF,
		static_url: GIF,
		visible_in_picker: true,
		category: 'Birds'
	},
	{ shortcode: 'hidden', url: GIF, static_url: GIF, visible_in_picker: false }
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
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	let emojiRequests = 0;
	let posted = null;

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
		if (url.includes('/custom_emojis')) {
			emojiRequests++;
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(EMOJIS)
			});
		}
		if (url.includes('/api/v1/statuses') && req.method() === 'POST') {
			posted = JSON.parse(req.postData() || '{}');
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					id: '99',
					content: '',
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
					sensitive: false,
					spoiler_text: '',
					replies_count: 0,
					reblogs_count: 0,
					favourites_count: 0,
					url: '',
					uri: ''
				})
			});
		}
		return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
	});

	const page = await context.newPage();
	page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 200)));
	await page.addInitScript(() => {
		const app = { client_id: 'x', client_secret: 'y', redirect_uri: '', scopes: '' };
		localStorage.setItem('phosphor:session:v1', JSON.stringify({ app, token: 'test-token' }));
	});

	await page.goto(BASE, { waitUntil: 'networkidle' });
	await page.waitForTimeout(600);

	await page.getByRole('button', { name: 'Custom-Emoji einfügen' }).click();
	await page.waitForTimeout(400);
	check('Emoji-Liste geladen', emojiRequests === 1, `${emojiRequests} Request(s)`);
	const picker = page.getByRole('dialog', { name: 'Custom-Emojis' });
	check('Picker offen', await picker.isVisible());
	check(
		'nur sichtbare Emojis (2)',
		(await picker.getByRole('button').count()) === 2,
		String(await picker.getByRole('button').count())
	);

	await picker.getByRole('searchbox').fill('blob');
	await page.waitForTimeout(200);
	check(
		'Suche filtert auf 1',
		(await picker.getByRole('button').count()) === 1,
		String(await picker.getByRole('button').count())
	);

	const textarea = page.locator('textarea').first();
	await textarea.fill('Hallo Welt');
	await textarea.evaluate((el) => el.setSelectionRange(5, 5));
	await picker.getByRole('button', { name: ':blobcat:' }).click();
	await page.waitForTimeout(250);
	const value = await textarea.inputValue();
	check('Shortcode an Cursorposition', value === 'Hallo:blobcat:  Welt', JSON.stringify(value));
	check('Picker schließt nach Auswahl', (await picker.count()) === 0);

	await page.getByRole('button', { name: /Posten/ }).click();
	await page.waitForTimeout(800);
	check(
		'Shortcode im POST-Body',
		posted?.status === 'Hallo:blobcat:  Welt',
		JSON.stringify(posted?.status)
	);

	console.log(`\n${checks.filter(Boolean).length}/${checks.length} Checks bestanden`);
	await browser.close();
	process.exit(checks.every(Boolean) ? 0 : 1);
})();

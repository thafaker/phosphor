// Prüft die Sprachwahl, die Persistenz und dass Zahlenformate mitwandern.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4174';

const ACCOUNT = {
	id: '9',
	username: 'user9',
	acct: 'user9',
	display_name: 'User 9',
	locked: false,
	bot: false,
	created_at: '2024-01-01T00:00:00Z',
	note: '',
	url: 'http://example.test/@user9',
	avatar: '',
	avatar_static: '',
	header: '',
	header_static: '',
	followers_count: 1500,
	following_count: 12,
	statuses_count: 3,
	last_status_at: null,
	emojis: [],
	fields: [],
	source: { status_content_type: 'text/plain' }
};

let checks = [];
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
		viewport: { width: 1100, height: 900 }
	});

	await context.route('**/api/**', (route) => {
		const url = route.request().url();
		if (url.includes('verify_credentials')) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(ACCOUNT)
			});
		}
		if (/\/api\/v1\/accounts\/[^/]+$/.test(url)) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(ACCOUNT)
			});
		}
		return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
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

	await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(500);

	check(
		'Standardsprache ist Deutsch',
		(await page.getByRole('heading', { name: 'Einstellungen', exact: true }).count()) === 1
	);
	check(
		'Dokumentsprache ist de',
		(await page.evaluate(() => document.documentElement.lang)) === 'de',
		await page.evaluate(() => document.documentElement.lang)
	);

	await page.getByRole('button', { name: 'English', exact: true }).click();
	await page.waitForTimeout(300);

	check(
		'Englische Überschrift',
		(await page.getByRole('heading', { name: 'Settings', exact: true }).count()) === 1
	);
	check(
		'Seitenleiste übersetzt',
		(await page.getByRole('link', { name: 'Home', exact: true }).count()) === 1
	);
	check(
		'Dokumentsprache ist en',
		(await page.evaluate(() => document.documentElement.lang)) === 'en',
		await page.evaluate(() => document.documentElement.lang)
	);
	check(
		'Sprachabschnitt übersetzt',
		(await page.getByRole('heading', { name: 'Language', exact: true }).count()) === 1
	);
	check(
		'Auswahl als aktiv markiert',
		(await page
			.getByRole('button', { name: 'English', exact: true })
			.getAttribute('aria-pressed')) === 'true'
	);

	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(500);
	check(
		'Sprache überlebt den Reload',
		(await page.getByRole('heading', { name: 'Settings', exact: true }).count()) === 1
	);

	await page.goto(`${BASE}/accounts/9`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(600);
	check('Englisches Zahlenformat', (await page.getByText('1,500', { exact: true }).count()) === 1);
	check('Englische Profil-Labels', (await page.getByText(/Followers/).count()) >= 1);

	await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(400);
	await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
	await page.waitForTimeout(300);
	check(
		'Zurück auf Deutsch',
		(await page.getByRole('heading', { name: 'Einstellungen', exact: true }).count()) === 1
	);

	await page.goto(`${BASE}/accounts/9`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(600);
	check('Deutsches Zahlenformat', (await page.getByText('1.500', { exact: true }).count()) === 1);
	check('Deutsche Profil-Labels', (await page.getByText(/Follower/).count()) >= 1);

	console.log(`\n${checks.filter(Boolean).length}/${checks.length} Checks bestanden`);
	await browser.close();
	process.exit(checks.every(Boolean) ? 0 : 1);
})();

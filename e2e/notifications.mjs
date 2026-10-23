// Prüft Meldungsfilter und den lokalen Gelesen-Status (inkl. Persistenz).
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4174';

const ACCOUNT = (id) => ({
	id,
	username: `user${id}`,
	acct: `user${id}`,
	display_name: `User ${id}`,
	locked: false,
	bot: false,
	created_at: '2024-01-01T00:00:00Z',
	note: '',
	url: `http://example.test/@user${id}`,
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
});

const NOTIFICATIONS = [
	{ id: 'n5', type: 'mention', created_at: '2026-01-01T00:05:00Z', account: ACCOUNT('5') },
	{ id: 'n4', type: 'favourite', created_at: '2026-01-01T00:04:00Z', account: ACCOUNT('4') },
	{ id: 'n3', type: 'follow', created_at: '2026-01-01T00:03:00Z', account: ACCOUNT('3') },
	{ id: 'n2', type: 'reblog', created_at: '2026-01-01T00:02:00Z', account: ACCOUNT('2') },
	{ id: 'n1', type: 'poll', created_at: '2026-01-01T00:01:00Z', account: ACCOUNT('1') }
];

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
	const context = await browser.newContext({ viewport: { width: 900, height: 900 } });

	await context.route('**/api/**', (route) => {
		const url = route.request().url();
		if (url.includes('verify_credentials')) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(ACCOUNT('9'))
			});
		}
		if (url.includes('/api/v1/notifications')) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(NOTIFICATIONS)
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

	await page.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(600);

	const items = page.locator('ul > li');
	check('5 Meldungen geladen', (await items.count()) === 5, String(await items.count()));
	check(
		'6 Filter-Tabs',
		(await page.getByRole('tab').count()) === 6,
		String(await page.getByRole('tab').count())
	);
	check(
		'Alle ungelesen',
		(await page.locator('[aria-label="Ungelesen"]').count()) === 5,
		String(await page.locator('[aria-label="Ungelesen"]').count())
	);

	await page.getByRole('tab', { name: /Favoriten/ }).click();
	await page.waitForTimeout(200);
	check('Favoriten filtert auf 1', (await items.count()) === 1, String(await items.count()));

	await page.getByRole('tab', { name: /^Alle/ }).click();
	await page.waitForTimeout(200);

	// Erste (neueste) Meldung einzeln als gelesen markieren.
	await page.getByRole('button', { name: 'Als gelesen markieren' }).first().click();
	await page.waitForTimeout(200);
	check(
		'eine Meldung gelesen',
		(await page.locator('[aria-label="Ungelesen"]').count()) === 4,
		String(await page.locator('[aria-label="Ungelesen"]').count())
	);

	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(600);
	check(
		'Gelesen-Status überlebt Reload',
		(await page.locator('[aria-label="Ungelesen"]').count()) === 4,
		String(await page.locator('[aria-label="Ungelesen"]').count())
	);

	await page.getByRole('button', { name: /Alle gelesen/ }).click();
	await page.waitForTimeout(200);
	check(
		'Alle gelesen entfernt alle Punkte',
		(await page.locator('[aria-label="Ungelesen"]').count()) === 0,
		String(await page.locator('[aria-label="Ungelesen"]').count())
	);
	check(
		'Button „Alle gelesen“ verschwindet',
		(await page.getByRole('button', { name: /Alle gelesen/ }).count()) === 0
	);

	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForTimeout(600);
	check(
		'Wassermarke überlebt Reload',
		(await page.locator('[aria-label="Ungelesen"]').count()) === 0,
		String(await page.locator('[aria-label="Ungelesen"]').count())
	);

	console.log(`\n${checks.filter(Boolean).length}/${checks.length} Checks bestanden`);
	await browser.close();
	process.exit(checks.every(Boolean) ? 0 : 1);
})();

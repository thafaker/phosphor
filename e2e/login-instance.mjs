// Prüft die Instanz-Eingabe auf der Login-Seite: Normalisierung, Validierung
// und dass die OAuth-App auf der eingegebenen Instanz registriert wird.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4174';

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
	const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });

	let appRegistration = null;
	await context.route('https://example.social/**', (route) => {
		const request = route.request();
		if (request.url().endsWith('/api/v1/apps') && request.method() === 'POST') {
			appRegistration = JSON.parse(request.postData() || '{}');
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ client_id: 'client-123', client_secret: 'secret-456' })
			});
		}
		// Die Weiterleitung zur Autorisierung wird nicht wirklich verlassen.
		return route.fulfill({
			status: 200,
			contentType: 'text/html',
			body: '<!doctype html><title>authorize</title>'
		});
	});

	const page = await context.newPage();
	page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 200)));

	await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(400);

	const input = page.getByLabel('Instanz');
	check('Login fragt nach der Instanz', (await input.count()) === 1);
	check(
		'leere Instanz deaktiviert den Button',
		await page.getByRole('button', { name: /Instanz angeben/ }).isDisabled()
	);

	await input.fill('ftp://example.social');
	await page.waitForTimeout(100);
	check(
		'ungültiges Schema wird abgelehnt',
		await page.getByRole('button', { name: /Instanz angeben/ }).isDisabled()
	);

	await input.fill('https://user:pass@example.social');
	await page.waitForTimeout(100);
	check(
		'Zugangsdaten in der URL werden abgelehnt',
		await page.getByRole('button', { name: /Instanz angeben/ }).isDisabled()
	);

	await input.fill('example.social');
	await page.waitForTimeout(100);
	const submit = page.getByRole('button', { name: /Mit example\.social anmelden/ });
	check('HTTPS wird ergänzt und angezeigt', await submit.isEnabled());

	await submit.click();
	await page.waitForTimeout(1200);

	const stored = (await context.storageState()).origins.find(
		(entry) => entry.origin === new URL(BASE).origin
	)?.localStorage;
	check(
		'Instanz wird gespeichert',
		stored?.some(
			(entry) => entry.name === 'phosphor:instance:v1' && entry.value === 'https://example.social'
		) === true,
		JSON.stringify(stored?.find((entry) => entry.name === 'phosphor:instance:v1'))
	);

	const url = new URL(page.url());
	check('leitet zur richtigen Instanz', url.origin === 'https://example.social', page.url());
	check('OAuth-Pfad', url.pathname === '/oauth/authorize', url.pathname);
	check(
		'redirect_uri zeigt auf diese App',
		url.searchParams.get('redirect_uri') === `${new URL(BASE).origin}/callback`,
		String(url.searchParams.get('redirect_uri'))
	);
	check('client_id übernommen', url.searchParams.get('client_id') === 'client-123');
	check(
		'App bei der Instanz registriert',
		appRegistration?.redirect_uris === `${new URL(BASE).origin}/callback`
	);
	check(
		'Scopes angefordert',
		typeof appRegistration?.scopes === 'string' && appRegistration.scopes.includes('read')
	);

	await browser.close();
	const failed = checks.filter((ok) => !ok).length;
	console.log(`\n${checks.length - failed}/${checks.length} Checks bestanden`);
	process.exit(failed ? 1 : 0);
})();

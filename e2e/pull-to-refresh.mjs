// Prüft Pull-to-Refresh gegen den echten Build (vite preview).
//
// In einem Browser-Tab ist die Geste standardmäßig aus (dort lädt der Browser
// selbst neu), also wird sie zuerst über die Einstellung "Immer" aktiviert.
// Danach: Schwelle, Dämpfung, Scroll- und Seitenwisch-Abgrenzung, Auslösung.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const EMPTY = '[]';
const ACCOUNT = {
	id: '1',
	username: 'tester',
	acct: 'tester',
	display_name: 'Tester',
	locked: true,
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
	fields: []
};

let results = [];
function check(name, ok, detail = '') {
	results.push({ name, ok });
	console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function swipe(cdp, page, { fromY, toY, steps = 12, x = 200 }) {
	await cdp.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: [{ x, y: fromY }]
	});
	for (let i = 1; i <= steps; i++) {
		const y = fromY + ((toY - fromY) * i) / steps;
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
		await page.waitForTimeout(16);
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

(async () => {
	const browser = await chromium.launch({
		...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
		args: ['--no-sandbox']
	});
	const context = await browser.newContext({
		viewport: { width: 390, height: 780 },
		hasTouch: true,
		isMobile: true
	});

	let requests = 0;
	let listRequests = 0;
	let timelineRequests = 0;
	await context.route('**/api/**', (route) => {
		requests++;
		const url = route.request().url();
		if (url.includes('verify_credentials')) {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(ACCOUNT)
			});
		}
		if (url.includes('follow_requests')) listRequests++;
		if (url.includes('/timelines/')) timelineRequests++;
		return route.fulfill({ status: 200, contentType: 'application/json', body: EMPTY });
	});

	const page = await context.newPage();
	page.on('pageerror', (err) => console.log('   [pageerror]', String(err).slice(0, 160)));
	await page.addInitScript(() => {
		const app = { client_id: 'x', client_secret: 'y', redirect_uri: '', scopes: '' };
		localStorage.setItem('phosphor:session:v1', JSON.stringify({ app, token: 'test-token' }));
	});

	// --- Einstellung auf "Immer" stellen ---------------------------------
	await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(400);
	await page
		.getByRole('button', { name: /^Immer/ })
		.first()
		.click();
	await page.waitForTimeout(200);
	check(
		'Einstellung "Immer" aktiviert die Geste',
		(await page.innerText('body')).includes('Aktiv.')
	);

	await page.goto(`${BASE}/follow_requests`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(400);
	const cdp = await context.newCDPSession(page);

	// Die Seite lädt beim Öffnen schon selbst eine Liste; für die Zählung
	// unten ist nur interessant, was die Geste zusätzlich auslöst.
	listRequests = 0;

	// --- 1) Unter der Schwelle passiert nichts ---------------------------
	requests = 0;
	await swipe(cdp, page, { fromY: 200, toY: 240 });
	await page.waitForTimeout(500);
	check('kurze Geste löst nicht aus', requests === 0, `${requests} Requests`);

	// --- 2) Über der Schwelle lädt neu ----------------------------------
	listRequests = 0;
	await swipe(cdp, page, { fromY: 150, toY: 420 });
	await page.waitForTimeout(1200);
	check('lange Geste lädt neu', listRequests > 0, `${listRequests} Listen-Request(s)`);
	check(
		'lange Geste lädt die Timeline nach',
		timelineRequests > 0,
		`${timelineRequests} Timeline-Request(s)`
	);

	// --- 3) Dämpfung: der Zug wird kürzer als der Fingerweg -------------
	await page.waitForTimeout(600); // Indikator zurück in Ruhe
	timelineRequests = 0;
	const cdpPromise = (async () => {
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [{ x: 200, y: 200 }]
		});
		for (let i = 1; i <= 10; i++) {
			await cdp.send('Input.dispatchTouchEvent', {
				type: 'touchMove',
				touchPoints: [{ x: 200, y: 200 + i * 20 }]
			});
			await page.waitForTimeout(16);
		}
	})();
	await cdpPromise;
	const transform = await page.evaluate(
		() => document.querySelector('.shadow-glow')?.style.transform
	);
	const pulled = Number(transform?.match(/translateY\(([\d.]+)px\)/)?.[1] ?? -1);
	check('Gedämpft: 200 px Fingerweg → 100 px Zug', pulled > 80 && pulled < 120, transform);
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await page.waitForTimeout(900);

	// --- 4) Im gescrollten Zustand keine Geste --------------------------
	await page.evaluate(() => {
		document.body.style.minHeight = '3000px';
		window.scrollTo(0, 600);
	});
	await page.waitForTimeout(200);
	requests = 0;
	await swipe(cdp, page, { fromY: 300, toY: 600 });
	await page.waitForTimeout(500);
	check('gescrollt: kein Refresh', requests === 0, `${requests} Requests`);

	// --- 5) Seitliche Wischbewegung löst nicht aus ----------------------
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.waitForTimeout(200);
	requests = 0;
	await cdp.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: [{ x: 100, y: 200 }]
	});
	for (let i = 1; i <= 12; i++) {
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [{ x: 100 + i * 12, y: 200 + i * 8 }]
		});
		await page.waitForTimeout(16);
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await page.waitForTimeout(500);
	check('seitliche Geste: kein Refresh', requests === 0, `${requests} Requests`);

	// --- 6) Aufwärtswischen (Scrollen) löst nicht aus -------------------
	requests = 0;
	await swipe(cdp, page, { fromY: 500, toY: 200 });
	await page.waitForTimeout(500);
	check('Aufwärtswischen: kein Refresh', requests === 0, `${requests} Requests`);

	await browser.close();

	const failed = results.filter((r) => !r.ok).length;
	console.log(`\n${results.length - failed}/${results.length} Prüfungen bestanden`);
	process.exit(failed ? 1 : 0);
})();

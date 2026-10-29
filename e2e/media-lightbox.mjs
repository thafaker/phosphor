// Prüft die In-App-Medienansicht: Bilder öffnen im Overlay (kein neuer Tab),
// Navigation per Pfeiltasten, Fokus-Rückgabe, Audio-Player und die
// Custom-Emoji-Auflösung im Beitragstext.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4174';

const RED_IMAGE =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23c00'/%3E%3C/svg%3E";
const BLUE_IMAGE =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23007'/%3E%3C/svg%3E";
const BLOB =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='10' fill='%230a0'/%3E%3C/svg%3E";
// 44-Byte-WAV-Kopf ohne Samples; der Browser muss nichts nachladen.
const SILENT_WAV =
	'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

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
	statuses_count: 1,
	last_status_at: null,
	emojis: [],
	fields: []
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
	uri: 'https://social.janmontag.de/users/tester/statuses/s1',
	url: 'https://social.janmontag.de/@tester/s1',
	replies_count: 0,
	reblogs_count: 0,
	favourites_count: 0,
	content: '<p>Bildpost :blobcat:</p><pre><code>:blobcat:</code></pre>',
	reblog: null,
	account: ACCOUNT,
	media_attachments: [
		{
			id: 'm1',
			type: 'image',
			url: RED_IMAGE,
			preview_url: RED_IMAGE,
			description: 'Rotes Bild'
		},
		{
			id: 'm2',
			type: 'image',
			url: BLUE_IMAGE,
			preview_url: BLUE_IMAGE,
			description: ''
		},
		{
			id: 'm3',
			type: 'audio',
			url: SILENT_WAV,
			preview_url: '',
			description: 'Kurze Tondatei'
		}
	],
	mentions: [],
	tags: [],
	emojis: [
		{
			shortcode: 'blobcat',
			url: BLOB,
			static_url: BLOB,
			visible_in_picker: true
		}
	],
	card: null,
	poll: null,
	favourited: false,
	reblogged: false,
	bookmarked: false
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

		if (path === '/api/v1/accounts/verify_credentials') return json(ACCOUNT);
		if (path === '/api/v2/instance') {
			return json({
				configuration: {
					statuses: { max_characters: 5000, max_media_attachments: 6 },
					media_attachments: {}
				}
			});
		}
		if (path === '/api/v1/timelines/home') return json([STATUS]);
		return json([]);
	});

	let popups = 0;
	const page = await context.newPage();
	context.on('page', () => (popups += 1));
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

	check(
		'Custom-Emoji im Beitrag ersetzt',
		(await page.locator('.status-content img[alt=":blobcat:"]').count()) === 1
	);
	check(
		'Custom-Emoji im Codeblock bleibt Text',
		(await page.locator('.status-content pre').innerText()).includes(':blobcat:')
	);
	check(
		'Audio ist inline abspielbar',
		(await page.locator(`audio[src="${SILENT_WAV}"]`).count()) === 1
	);

	const imageButton = page.getByRole('button', { name: 'Bild öffnen: Rotes Bild' });
	check('Bild ist ein In-App-Button', (await imageButton.count()) === 1);

	await imageButton.click();
	await page.waitForTimeout(200);
	const dialog = page.getByRole('dialog', { name: 'Medienansicht' });
	check('Medienansicht offen', await dialog.isVisible());
	check(
		'Body-Scroll gesperrt',
		(await page.evaluate(() => document.body.style.overflow)) === 'hidden'
	);
	check(
		'Zähler zeigt erstes von drei Medien',
		(await dialog.getByText('1 / 3', { exact: true }).count()) === 1
	);
	check(
		'Großes Bild zeigt die Original-URL',
		(await dialog.locator(`img[src="${RED_IMAGE}"]`).count()) === 1
	);
	check(
		'ALT-Text ist sichtbar',
		(await dialog.getByText('Rotes Bild', { exact: true }).count()) === 1
	);
	check('kein neuer Tab geöffnet', popups === 0);

	await page.keyboard.press('ArrowRight');
	await page.waitForTimeout(150);
	check(
		'nächstes Bild per Pfeiltaste',
		(await dialog.getByText('2 / 3', { exact: true }).count()) === 1 &&
			(await dialog.locator(`img[src="${BLUE_IMAGE}"]`).count()) === 1
	);

	await page.keyboard.press('ArrowRight');
	await page.waitForTimeout(150);
	check(
		'Audio im Overlay erreichbar',
		(await dialog.getByText('3 / 3', { exact: true }).count()) === 1 &&
			(await dialog.locator('audio').count()) === 1
	);
	check(
		'Audio-Beschreibung sichtbar',
		(await dialog.getByText('Kurze Tondatei', { exact: true }).count()) === 1
	);

	await page.keyboard.press('Escape');
	await page.waitForTimeout(200);
	check('Escape schließt die Medienansicht', (await dialog.count()) === 0);
	check(
		'Fokus kehrt zum Auslöser zurück',
		(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) ===
			'Bild öffnen: Rotes Bild'
	);
	check(
		'Body-Scroll wieder freigegeben',
		(await page.evaluate(() => document.body.style.overflow)) === ''
	);

	await imageButton.click();
	await page.waitForTimeout(150);
	await page.getByRole('button', { name: 'Medienansicht schließen' }).click();
	await page.waitForTimeout(200);
	check('Schließen-Button schließt die Ansicht', (await dialog.count()) === 0);
	check('weiterhin kein neuer Tab', popups === 0);

	await browser.close();
	const failed = checks.filter((ok) => !ok).length;
	console.log(`\n${checks.length - failed}/${checks.length} Checks bestanden`);
	process.exit(failed ? 1 : 0);
})();

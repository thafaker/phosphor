// Prüft die Client-Komprimierung vor dem Upload: Ein künstlich großes Foto
// wird auf 1024 px verkleinert, als JPEG neu kodiert und deutlich kleiner
// hochgeladen. Die Vorschau zeigt die Ersparnis.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:4174';

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
	statuses_count: 0,
	last_status_at: null,
	emojis: [],
	fields: []
};

const CREATED = {
	id: 'new',
	created_at: '2026-01-01T00:00:00Z',
	edited_at: null,
	in_reply_to_id: null,
	in_reply_to_account_id: null,
	sensitive: false,
	spoiler_text: '',
	visibility: 'public',
	language: 'de',
	uri: 'https://social.janmontag.de/users/tester/statuses/new',
	url: 'https://social.janmontag.de/@tester/new',
	replies_count: 0,
	reblogs_count: 0,
	favourites_count: 0,
	content: '<p>Komprimierungstest</p>',
	reblog: null,
	account: ACCOUNT,
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

	let uploadBody = null;
	await context.route('**/api/**', (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		const json = (body) =>
			route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

		if (path === '/api/v1/accounts/verify_credentials') return json(ACCOUNT);
		if (path === '/api/v2/instance') {
			return json({
				configuration: {
					statuses: { max_characters: 5000, max_media_attachments: 6 },
					media_attachments: {
						supported_mime_types: ['image/jpeg', 'image/png'],
						image_size_limit: 40 * 1024 * 1024,
						video_size_limit: 40 * 1024 * 1024,
						description_limit: 1500
					}
				}
			});
		}
		if (path === '/api/v2/media' && request.method() === 'POST') {
			uploadBody = request.postDataBuffer();
			return json({
				id: 'media1',
				type: 'image',
				url: 'https://social.janmontag.de/media/compressed.jpg',
				preview_url: 'https://social.janmontag.de/media/compressed.jpg',
				description: ''
			});
		}
		if (path === '/api/v1/statuses' && request.method() === 'POST') return json(CREATED);
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
	await page.waitForTimeout(500);

	// 3000 × 2000 Rauschen → ein großes JPEG, das sicher über der Schwelle liegt.
	const original = await page.evaluate(async () => {
		const canvas = document.createElement('canvas');
		canvas.width = 3000;
		canvas.height = 2000;
		const context = canvas.getContext('2d');
		const pixels = context.createImageData(canvas.width, canvas.height);
		for (let index = 0; index < pixels.data.length; index += 4) {
			pixels.data[index] = Math.random() * 256;
			pixels.data[index + 1] = Math.random() * 256;
			pixels.data[index + 2] = Math.random() * 256;
			pixels.data[index + 3] = 255;
		}
		context.putImageData(pixels, 0, 0);
		const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
		const file = new File([blob], 'gross.jpg', { type: 'image/jpeg' });
		const input = document.querySelector('input[type=file]');
		const transfer = new DataTransfer();
		transfer.items.add(file);
		input.files = transfer.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		return { size: file.size, width: canvas.width, height: canvas.height };
	});

	check(
		'Testfoto ist groß genug',
		original.size > 1024 * 1024,
		`${Math.round(original.size / 1024)} KB`
	);

	await page.waitForFunction(
		() => {
			const image = document.querySelector('ul li img');
			return image && image.complete && image.naturalWidth > 0 && image.naturalWidth <= 1024;
		},
		null,
		{ timeout: 20_000 }
	);

	const previewWidth = await page.evaluate(
		() => document.querySelector('ul li img')?.naturalWidth ?? 0
	);
	check(
		'Vorschau ist auf 1024 px begrenzt',
		previewWidth > 0 && previewWidth <= 1024,
		`${previewWidth}px`
	);

	const attachmentText = await page.locator('ul li').first().innerText();
	check(
		'Ersparnis wird angezeigt',
		attachmentText.includes('→'),
		attachmentText.replaceAll('\n', ' ')
	);

	await page.locator('textarea[placeholder="Was gibt es Neues?"]').fill('Komprimierungstest');
	await page.getByRole('button', { name: 'Posten' }).click();
	await page.waitForTimeout(1500);

	check('Upload wurde ausgelöst', uploadBody !== null);
	const uploadSize = uploadBody?.length ?? 0;
	const uploadHead = uploadBody?.subarray(0, 2000).toString('latin1') ?? '';
	check(
		'Upload ist deutlich kleiner als das Original',
		uploadSize > 0 && uploadSize < original.size / 2,
		`${Math.round(original.size / 1024)} KB → ${Math.round(uploadSize / 1024)} KB`
	);
	check(
		'Upload bleibt unter 1,5 MB',
		uploadSize < 1.5 * 1024 * 1024,
		`${Math.round(uploadSize / 1024)} KB`
	);
	check(
		'Upload ist ein JPEG',
		uploadHead.includes('Content-Type: image/jpeg'),
		uploadHead.includes('filename="gross.jpg"') ? 'gross.jpg' : ''
	);

	await browser.close();
	const failed = checks.filter((ok) => !ok).length;
	console.log(`\n${checks.length - failed}/${checks.length} Checks bestanden`);
	process.exit(failed ? 1 : 0);
})();

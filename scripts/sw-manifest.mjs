#!/usr/bin/env node
/**
 * Post-build step: describes the static bundle to the service worker.
 *
 * Vite emits content-hashed file names, so the worker cannot know them ahead
 * of time. This script walks `build/`, writes `sw-manifest.json` with every
 * file URL, and stamps a content hash into `sw.js`. A new deploy therefore
 * produces a new `VERSION`, the worker installs a fresh cache and removes the
 * old one on activation.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['sw.js', 'sw-manifest.json']);

/*
 * `vite build` leaves the deployable bundle in `build/`, but `vite preview`
 * (and therefore the E2E suite) serves the adapter's intermediate output from
 * `.svelte-kit/output/client`. Both need the manifest and a stamped sw.js.
 */
const TARGETS = [join(ROOT, 'build'), join(ROOT, '.svelte-kit/output/client')].filter((dir) =>
	existsSync(join(dir, 'sw.js'))
);

function walk(dir) {
	const entries = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		const stats = statSync(full);
		if (stats.isDirectory()) entries.push(...walk(full));
		else entries.push(full);
	}
	return entries;
}

function prepare(dir) {
	const files = walk(dir)
		.map((file) => ({
			file,
			url: `/${relative(dir, file).split(sep).join('/')}`,
			buffer: readFileSync(file)
		}))
		.filter(({ url }) => !SKIP.has(url.slice(1)))
		.sort((a, b) => a.url.localeCompare(b.url));

	const hash = createHash('sha256');
	for (const { url, buffer } of files) {
		hash.update(url);
		hash.update('\0');
		hash.update(buffer);
	}
	const version = hash.digest('hex').slice(0, 12);

	writeFileSync(
		join(dir, 'sw-manifest.json'),
		`${JSON.stringify({ version, files: files.map(({ url }) => url) }, null, '\t')}\n`
	);

	const swPath = join(dir, 'sw.js');
	const sw = readFileSync(swPath, 'utf8');
	const placeholder = "const VERSION = '__PHOSPHOR_VERSION__';";
	if (!sw.includes(placeholder)) {
		throw new Error(`sw.js is missing the __PHOSPHOR_VERSION__ placeholder (${dir})`);
	}
	writeFileSync(swPath, sw.replace(placeholder, `const VERSION = '${version}';`));

	console.log(
		`→ Service worker: ${relative(ROOT, dir)} — ${files.length} Dateien, Version ${version}`
	);
}

if (!TARGETS.length) throw new Error('No build output found; run vite build first');
for (const dir of TARGETS) prepare(dir);

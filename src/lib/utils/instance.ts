/**
 * Turn user input into an instance base URL.
 *
 * Accepts `example.social`, `https://example.social/`, `http://localhost:8080`
 * (for local development) and trims paths, queries and fragments: GoToSocial
 * lives at the origin root. Returns `null` if the input cannot be a base URL.
 */
export function normalizeInstanceUrl(input: string | null | undefined): string | null {
	const trimmed = (input ?? '').trim();
	if (!trimmed) return null;

	// Assume HTTPS when no scheme was typed; keep an explicit http:// for local
	// development only (the browser will still enforce mixed-content rules).
	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

	let url: URL;
	try {
		url = new URL(withScheme);
	} catch {
		return null;
	}

	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	if (!url.hostname) return null;
	// Credentials in the URL would end up in the OAuth redirect; refuse them.
	if (url.username || url.password) return null;

	return url.origin;
}

/** Display form of an instance URL (`social.example.org`), without scheme. */
export function instanceHost(url: string | null | undefined): string {
	if (!url) return '';
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

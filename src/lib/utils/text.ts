import type { CustomEmoji, Mention } from '#lib/api/types.ts';

export function escapeHtml(input: string): string {
	return input
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

const SHORTCODE = /:([a-zA-Z0-9_]+):/g;

/**
 * Turn `:shortcode:` custom emojis in plain text (display names, bios) into
 * <img> tags. The surrounding text is escaped first, so this is safe to feed
 * into {@html}.
 */
export function emojify(text: string, emojis: CustomEmoji[] = []): string {
	if (!emojis.length) return escapeHtml(text);
	const map = new Map(emojis.map((emoji) => [emoji.shortcode, emoji.url]));
	return escapeHtml(text).replace(SHORTCODE, (match, code: string) => {
		const url = map.get(code);
		if (!url) return match;
		const alt = escapeHtml(match);
		return `<img class="inline-block h-[1.2em] w-[1.2em] align-[-0.2em]" src="${escapeHtml(url)}" alt="${alt}" title="${alt}" />`;
	});
}

/** Normalise an account URL so trailing slashes do not break the lookup. */
function mentionUrlKey(url: string): string {
	const trimmed = url.trim();
	try {
		const parsed = new URL(trimmed);
		return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
	} catch {
		return trimmed.replace(/\/+$/, '');
	}
}

/**
 * Derive `username@host` from a profile URL. GoToSocial renders remote
 * mentions as `@<span>username</span>` — without the domain — so the URL is
 * the only place the host is available.
 */
function acctFromUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		const match = /\/@([^/]+)\/?$/.exec(parsed.pathname);
		if (!match) return null;
		const handle = decodeURIComponent(match[1]);
		return (handle.includes('@') ? handle : `${handle}@${parsed.hostname}`).toLowerCase();
	} catch {
		return null;
	}
}

/** Plain text of an anchor, e.g. `@alice@remote.example`. */
function anchorText(html: string): string {
	return html
		.replace(/<[^>]*>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.trim();
}

/**
 * Rewrite mentions in post content to internal profile links. GoToSocial
 * marks them with `class="mention"` and returns the matching accounts in
 * `status.mentions`; the visible `@acct` text is a fallback for instances
 * whose URLs differ from the canonical account URL.
 */
export function linkMentions(html: string, mentions: Mention[] = []): string {
	if (!mentions.length) return html;

	const byUrl = new Map<string, string>();
	const byAcct = new Map<string, string>();
	for (const mention of mentions) {
		if (mention.url) byUrl.set(mentionUrlKey(mention.url), mention.id);
		if (mention.acct) byAcct.set(mention.acct.toLowerCase(), mention.id);
	}

	return html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (anchor, attrs: string, inner: string) => {
		const href = /\bhref="([^"]*)"/i.exec(attrs)?.[1] ?? '';
		const className = /\bclass="([^"]*)"/i.exec(attrs)?.[1] ?? '';
		const text = anchorText(inner);
		// Hashtags share the mention class in GoToSocial (`mention hashtag`).
		const isHashtag = /\bhashtag\b/i.test(className) || text.startsWith('#');
		const isMention =
			!isHashtag &&
			(/\bmention\b/i.test(className) || (text.startsWith('@') && byUrl.has(mentionUrlKey(href))));
		if (!isMention) return anchor;

		const hrefAcct = acctFromUrl(href);
		const id =
			byUrl.get(mentionUrlKey(href)) ??
			byAcct.get(text.replace(/^@/, '').toLowerCase()) ??
			(hrefAcct ? byAcct.get(hrefAcct) : undefined);
		if (!id) return anchor;

		return `<a href="/accounts/${encodeURIComponent(id)}" class="mention">${inner}</a>`;
	});
}

/**
 * Open external links inside post content in a new tab. GoToSocial already
 * sanitises the `content` HTML, so we only annotate the anchors. Internal
 * (relative) links and links that already set a target stay untouched.
 */
export function withExternalLinks(html: string): string {
	return html.replace(/<a\b[^>]*>/gi, (tag) => {
		if (/\btarget\s*=/i.test(tag)) return tag;
		const href = /\bhref="([^"]*)"/i.exec(tag)?.[1] ?? '';
		if (!/^https?:\/\//i.test(href)) return tag;
		return tag.replace(/^<a\b/i, '<a target="_blank" rel="noopener noreferrer"');
	});
}

/** Strip HTML so we can show a short, plain-text preview (e.g. in the composer). */
export function stripHtml(html: string): string {
	const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n');
	const withoutTags = withBreaks.replace(/<[^>]+>/g, '');
	const textarea = document.createElement('textarea');
	textarea.innerHTML = withoutTags;
	return textarea.value.replace(/\n{3,}/g, '\n\n').trim();
}

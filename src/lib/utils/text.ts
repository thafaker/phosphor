import type { CustomEmoji } from '#lib/api/types.ts';

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

/**
 * Open links inside post content in a new tab. GoToSocial already sanitises
 * the `content` HTML, so we only annotate the anchors.
 */
export function withExternalLinks(html: string): string {
	return html.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');
}

/** Strip HTML so we can show a short, plain-text preview (e.g. in the composer). */
export function stripHtml(html: string): string {
	const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n');
	const withoutTags = withBreaks.replace(/<[^>]+>/g, '');
	const textarea = document.createElement('textarea');
	textarea.innerHTML = withoutTags;
	return textarea.value.replace(/\n{3,}/g, '\n\n').trim();
}

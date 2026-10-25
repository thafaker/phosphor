import { describe, expect, it } from 'vitest';
import type { Mention } from '#lib/api/types.ts';
import { linkMentions, withExternalLinks } from './text.ts';

function mention(overrides: Partial<Mention> = {}): Mention {
	return {
		id: '01LOCAL',
		username: 'alice',
		acct: 'alice',
		url: 'https://social.example/@alice',
		...overrides
	};
}

describe('linkMentions', () => {
	it('ersetzt lokale Erwähnungen durch interne Profillinks', () => {
		const html =
			'<p>Hallo <span class="h-card"><a href="https://social.example/@alice" class="u-url mention">@alice</a></span>!</p>';

		expect(linkMentions(html, [mention()])).toBe(
			'<p>Hallo <span class="h-card"><a href="/accounts/01LOCAL" class="mention">@alice</a></span>!</p>'
		);
	});

	it('ignoriert einen abschließenden Schrägstrich in der Konto-URL', () => {
		const html = '<a href="https://social.example/@alice/" class="u-url mention">@alice</a>';

		expect(linkMentions(html, [mention()])).toContain('href="/accounts/01LOCAL"');
	});

	it('findet entfernte Konten über den sichtbaren @acct-Text', () => {
		const html =
			'<a href="https://remote.example/@alice" class="u-url mention">@alice@remote.example</a>';
		const remote = mention({
			id: '01REMOTE',
			username: 'alice',
			acct: 'alice@remote.example',
			url: 'https://social.example/@alice@remote.example'
		});

		expect(linkMentions(html, [remote])).toBe(
			'<a href="/accounts/01REMOTE" class="mention">@alice@remote.example</a>'
		);
	});

	it('leitet die Domain aus der URL ab, wenn der Text sie nicht zeigt', () => {
		// So liefert GoToSocial entfernte Erwähnungen: @<span>name</span> ohne Domain.
		const html =
			'<p><span class="h-card"><a href="https://mastodon.social/@dfx_tech" class="u-url mention" rel="nofollow noreferrer noopener" target="_blank">@<span>dfx_tech</span></a></span> Text</p>';
		const remote = mention({
			id: '01REMOTE',
			username: 'dfx_tech',
			acct: 'dfx_tech@mastodon.social',
			url: 'https://social.example/@dfx_tech@mastodon.social'
		});

		const result = linkMentions(html, [remote]);
		expect(result).toContain(
			'<a href="/accounts/01REMOTE" class="mention">@<span>dfx_tech</span></a>'
		);
		expect(result).not.toContain('target=');
	});

	it('verwechselt Hashtags nicht mit Erwähnungen', () => {
		// GtS markiert Hashtags ebenfalls als `mention hashtag`.
		const html =
			'<a href="https://social.example/tags/alice" class="mention hashtag" rel="tag">#<span>alice</span></a>';

		expect(linkMentions(html, [mention()])).toBe(html);
	});

	it('ersetzt auch Erwähnungen ohne mention-Klasse, wenn Text und URL passen', () => {
		const html = '<a href="https://social.example/@alice">@alice</a>';

		expect(linkMentions(html, [mention()])).toContain('href="/accounts/01LOCAL"');
	});

	it('lässt unbekannte Erwähnungen unverändert', () => {
		const html =
			'<a href="https://remote.example/@bob" class="u-url mention">@bob@remote.example</a>';

		expect(linkMentions(html, [mention()])).toBe(html);
	});

	it('lässt normale Links unverändert', () => {
		const html = '<a href="https://social.example/@alice">Profil</a>';

		expect(linkMentions(html, [mention()])).toBe(html);
	});
});

describe('withExternalLinks', () => {
	it('öffnet absolute Links in einem neuen Tab', () => {
		expect(withExternalLinks('<a href="https://example.org/a">A</a>')).toBe(
			'<a target="_blank" rel="noopener noreferrer" href="https://example.org/a">A</a>'
		);
	});

	it('lässt interne Links in der App', () => {
		const html = '<a href="/accounts/01LOCAL" class="mention">@alice</a>';

		expect(withExternalLinks(html)).toBe(html);
	});

	it('überschreibt ein bereits gesetztes target nicht', () => {
		const html = '<a href="https://example.org" target="_self">A</a>';

		expect(withExternalLinks(html)).toBe(html);
	});
});

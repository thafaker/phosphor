import { describe, expect, it } from 'vitest';
import { originalStatusUrl } from './status.ts';

describe('originalStatusUrl', () => {
	it('bevorzugt die Web-URL des Beitrags', () => {
		expect(
			originalStatusUrl({
				url: 'https://remote.example/@alice/statuses/1',
				uri: 'https://remote.example/users/alice/statuses/1'
			})
		).toBe('https://remote.example/@alice/statuses/1');
	});

	it('fällt auf die ActivityPub-URI zurück, wenn url fehlt', () => {
		expect(
			originalStatusUrl({
				url: null,
				uri: 'https://remote.example/users/alice/statuses/1'
			})
		).toBe('https://remote.example/users/alice/statuses/1');
		expect(
			originalStatusUrl({ url: '', uri: 'https://remote.example/users/alice/statuses/1' })
		).toBe('https://remote.example/users/alice/statuses/1');
	});

	it('akzeptiert nur http(s)', () => {
		expect(
			originalStatusUrl({ url: 'javascript:alert(1)', uri: 'ftp://example.org/x' })
		).toBeNull();
		expect(originalStatusUrl({ url: null, uri: '' })).toBeNull();
	});
});

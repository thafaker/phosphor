import { describe, expect, it } from 'vitest';
import type { Relationship } from '#lib/api/types.ts';
import { followIntent, followLabel } from './account.ts';

function relationship(overrides: Partial<Relationship> = {}): Relationship {
	return {
		id: 'a1',
		following: false,
		requested: false,
		...overrides
	} as Relationship;
}

describe('followIntent', () => {
	it('follows when there is no relationship yet', () => {
		expect(followIntent(null)).toBe('follow');
	});

	it('follows when not following', () => {
		expect(followIntent(relationship())).toBe('follow');
	});

	it('unfollows when already following', () => {
		expect(followIntent(relationship({ following: true }))).toBe('unfollow');
	});

	it('withdraws a pending request (reported as requested)', () => {
		expect(followIntent(relationship({ requested: true }))).toBe('unfollow');
	});
});

describe('followLabel', () => {
	it('labels the follow button per state', () => {
		expect(followLabel(null)).toBe('Folgen');
		expect(followLabel(relationship())).toBe('Folgen');
		expect(followLabel(relationship({ following: true }))).toBe('Entfolgen');
		expect(followLabel(relationship({ requested: true }))).toBe('Angefragt');
	});
});

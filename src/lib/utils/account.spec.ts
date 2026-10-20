import { describe, expect, it } from 'vitest';
import type { Account, Relationship } from '#lib/api/types.ts';
import { followIntent, followLabel, replyMention } from './account.ts';

function relationship(overrides: Partial<Relationship> = {}): Relationship {
	return {
		id: 'a1',
		following: false,
		requested: false,
		...overrides
	} as Relationship;
}

function account(overrides: Partial<Account> = {}): Account {
	return { id: 'a1', username: 'alice', acct: 'alice', ...overrides } as Account;
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

describe('replyMention', () => {
	it('prepends the handle of the replied-to account', () => {
		expect(replyMention(account(), account({ id: 'me' }))).toBe('@alice');
	});

	it('keeps the domain of remote accounts', () => {
		const remote = account({ id: 'r1', username: 'bob', acct: 'bob@mastodon.art' });
		expect(replyMention(remote, account({ id: 'me' }))).toBe('@bob@mastodon.art');
	});

	it('mentions without a known viewer', () => {
		expect(replyMention(account(), null)).toBe('@alice');
	});

	it('stays silent when replying to ourselves', () => {
		const me = account({ id: 'me' });
		expect(replyMention(account({ id: 'me', username: 'janmontag', acct: 'janmontag' }), me)).toBe(
			null
		);
	});
});

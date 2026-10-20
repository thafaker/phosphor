import { describe, expect, it } from 'vitest';
import type { Status } from '#lib/api/types.ts';
import {
	applyThreadRevision,
	insertReply,
	mergeStatus,
	removeFromThread,
	threadHas
} from './thread.ts';

function status(id: string, inReplyTo: string | null = null): Status {
	return { id, in_reply_to_id: inReplyTo, replies_count: 0 } as Status;
}

describe('threadHas', () => {
	it('finds a status and a boosted original', () => {
		const boost = { id: 'boost', reblog: status('orig') } as Status;
		expect(threadHas([boost], 'orig')).toBe(true);
		expect(threadHas([boost], 'boost')).toBe(true);
		expect(threadHas([boost], 'other')).toBe(false);
	});
});

describe('insertReply', () => {
	const root = status('root');

	it('appends a reply to the root', () => {
		const next = insertReply([], root.id, status('a', 'root'));
		expect(next?.map((s) => s.id)).toEqual(['a']);
	});

	it('appends a reply to a descendant we already show', () => {
		const next = insertReply([status('a', 'root')], root.id, status('b', 'a'));
		expect(next?.map((s) => s.id)).toEqual(['a', 'b']);
	});

	it('ignores replies that do not touch the thread', () => {
		expect(insertReply([status('a', 'root')], root.id, status('z', 'elsewhere'))).toBeNull();
	});

	it('ignores a reply whose parent is missing', () => {
		expect(insertReply([], root.id, status('b', 'a'))).toBeNull();
	});

	it('ignores top-level posts and duplicates', () => {
		expect(insertReply([], root.id, status('a', null))).toBeNull();
		expect(insertReply([status('a', 'root')], root.id, status('a', 'root'))).toBeNull();
		expect(insertReply([], root.id, status('root'))).toBeNull();
	});
});

describe('applyThreadRevision', () => {
	it('patches a status in place so its card keeps its state', () => {
		const original = status('a', 'root');
		const thread = [original];

		applyThreadRevision(thread, { ...status('a', 'root'), content: 'neu' } as Status);

		expect(thread[0]).toBe(original);
		expect(thread[0].content).toBe('neu');
	});

	it('patches the original behind a boost wrapper', () => {
		const inner = status('orig');
		const boost = { id: 'boost', reblog: inner } as Status;
		const thread = [boost];

		applyThreadRevision(thread, { ...status('orig'), content: 'neu' } as Status);

		expect(thread[0]).toBe(boost);
		expect(inner.content).toBe('neu');
	});
});

describe('mergeStatus', () => {
	it('copies the rendered fields but keeps the target object', () => {
		const into = status('a');
		const from = {
			...status('a'),
			content: 'x',
			spoiler_text: 'cw',
			sensitive: true,
			replies_count: 3,
			favourites_count: 2,
			edited_at: '2024-01-01T00:00:00Z'
		} as Status;

		mergeStatus(into, from);

		expect(into.content).toBe('x');
		expect(into.spoiler_text).toBe('cw');
		expect(into.sensitive).toBe(true);
		expect(into.replies_count).toBe(3);
		expect(into.favourites_count).toBe(2);
		expect(into.edited_at).toBe('2024-01-01T00:00:00Z');
	});
});

describe('removeFromThread', () => {
	it('drops the status and any boost wrapper of it', () => {
		const thread = [status('a'), { id: 'boost', reblog: status('b') } as Status, status('c')];
		expect(removeFromThread(thread, 'b').map((s) => s.id)).toEqual(['a', 'c']);
		expect(removeFromThread(thread, 'a').map((s) => s.id)).toEqual(['boost', 'c']);
	});
});

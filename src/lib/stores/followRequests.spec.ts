import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Relationship } from '#lib/api/types.ts';

const api = vi.hoisted(() => ({
	homeTimeline: vi.fn(),
	publicTimeline: vi.fn(),
	getFollowRequests: vi.fn(),
	authorizeFollowRequest: vi.fn(),
	rejectFollowRequest: vi.fn()
}));

vi.mock('#lib/api/gotosocial.ts', () => api);

let FollowRequestsStore: typeof import('./followRequests.svelte.ts').FollowRequestsStore;

beforeAll(async () => {
	({ FollowRequestsStore } = await import('./followRequests.svelte.ts'));
});

function account(id: string): Account {
	return { id, username: id, acct: id } as Account;
}

function relationship(overrides: Partial<Relationship> = {}): Relationship {
	return { id: 'a', following: false, ...overrides } as Relationship;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('FollowRequestsStore', () => {
	it('loads the pending requests and exposes their count', async () => {
		api.getFollowRequests.mockResolvedValue([account('a'), account('b')]);
		const store = new FollowRequestsStore();

		await store.load();

		expect(store.pending).toBe(2);
		expect(store.loaded).toBe(true);
	});

	it('only loads once unless forced', async () => {
		api.getFollowRequests.mockResolvedValue([]);
		const store = new FollowRequestsStore();

		await store.load();
		await store.load();
		expect(api.getFollowRequests).toHaveBeenCalledTimes(1);

		await store.load(true);
		expect(api.getFollowRequests).toHaveBeenCalledTimes(2);
	});

	it('keeps an error instead of throwing', async () => {
		api.getFollowRequests.mockRejectedValue(new Error('kaputt'));
		const store = new FollowRequestsStore();

		await store.load();

		expect(store.error).toBe('kaputt');
		expect(store.loaded).toBe(false);
	});

	it('adds stream arrivals once and drops them on resolve', () => {
		const store = new FollowRequestsStore();
		store.add(account('a'));
		store.add(account('a'));
		expect(store.pending).toBe(1);

		store.resolve('a');
		expect(store.pending).toBe(0);
	});

	it('accepts a request, removes it locally and returns the relationship', async () => {
		api.getFollowRequests.mockResolvedValue([account('a'), account('b')]);
		api.authorizeFollowRequest.mockResolvedValue(relationship({ followed_by: true }));
		const store = new FollowRequestsStore();
		await store.load();

		const rel = await store.acceptAndReturn('a');

		expect(api.authorizeFollowRequest).toHaveBeenCalledWith('a');
		expect(rel.followed_by).toBe(true);
		expect(store.items.map((item) => item.id)).toEqual(['b']);
		expect(store.busy.a).toBeUndefined();
	});

	it('rejects a request and removes it locally', async () => {
		api.getFollowRequests.mockResolvedValue([account('a')]);
		api.rejectFollowRequest.mockResolvedValue(relationship());
		const store = new FollowRequestsStore();
		await store.load();

		await store.reject('a');

		expect(api.rejectFollowRequest).toHaveBeenCalledWith('a');
		expect(store.items).toEqual([]);
	});

	it('keeps the request in the list when the call fails, but rethrows', async () => {
		api.getFollowRequests.mockResolvedValue([account('a')]);
		api.authorizeFollowRequest.mockRejectedValue(new Error('nope'));
		const store = new FollowRequestsStore();
		await store.load();

		await expect(store.acceptAndReturn('a')).rejects.toThrow('nope');
		expect(store.items.map((item) => item.id)).toEqual(['a']);
		expect(store.busy.a).toBeUndefined();
	});

	it('ignores a second click while a request is in flight', async () => {
		api.getFollowRequests.mockResolvedValue([account('a')]);
		let release: (value: unknown) => void = () => {};
		api.authorizeFollowRequest.mockImplementation(
			() => new Promise((resolve) => (release = resolve))
		);
		const store = new FollowRequestsStore();
		await store.load();

		const first = store.acceptAndReturn('a');
		await expect(store.acceptAndReturn('a')).rejects.toThrow();
		expect(api.authorizeFollowRequest).toHaveBeenCalledTimes(1);

		release(relationship());
		await first;
		expect(store.items).toEqual([]);
		expect(store.busy.a).toBeUndefined();
	});
});

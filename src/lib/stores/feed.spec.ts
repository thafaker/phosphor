import { describe, expect, it, vi } from 'vitest';
import type { Status } from '#lib/api/types.ts';
import { TimelineFeed } from './feed.svelte.ts';

function status(id: string): Status {
	return { id } as Status;
}

describe('TimelineFeed.loadNew', () => {
	it('prepends only newer items, asking for the gap via sinceId', async () => {
		const loader = vi.fn(async ({ sinceId }: { sinceId?: string }) =>
			sinceId === '2' ? [status('3')] : [status('2'), status('1')]
		);
		const feed = new TimelineFeed(loader);

		await feed.load();
		expect(feed.items.map((s) => s.id)).toEqual(['2', '1']);

		await feed.loadNew();

		expect(loader).toHaveBeenLastCalledWith({ limit: 20, sinceId: '2' });
		expect(feed.items.map((s) => s.id)).toEqual(['3', '2', '1']);
	});

	it('keeps the existing pages intact rather than replacing them', async () => {
		const loader = vi.fn(async ({ sinceId, maxId }: { sinceId?: string; maxId?: string }) => {
			if (sinceId) return [];
			if (maxId) return [status('0')];
			return [status('2'), status('1')];
		});
		const feed = new TimelineFeed(loader);

		await feed.load();
		await feed.loadMore();
		expect(feed.items.map((s) => s.id)).toEqual(['2', '1', '0']);

		await feed.loadNew();

		// Nothing new, and the older page we paged in is still there.
		expect(feed.items.map((s) => s.id)).toEqual(['2', '1', '0']);
	});

	it('does nothing before the first page has loaded', async () => {
		const loader = vi.fn(async () => [status('1')]);
		const feed = new TimelineFeed(loader);

		await feed.loadNew();

		expect(loader).not.toHaveBeenCalled();
	});
});

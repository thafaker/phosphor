import { describe, expect, it, vi } from 'vitest';
import type { Status } from '#lib/api/types.ts';
import { TimelineFeed, type TimelineLoader } from './feed.svelte.ts';

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

describe('TimelineFeed.prepend', () => {
	async function loadedFeed(loader: TimelineLoader = async () => [status('1')]) {
		const feed = new TimelineFeed(loader);
		await feed.load();
		return feed;
	}

	it('puffert Stream-Beiträge, statt die Liste sofort zu verschieben', async () => {
		const feed = await loadedFeed();

		feed.prepend(status('3'));
		feed.prepend(status('2'));

		expect(feed.items.map((s) => s.id)).toEqual(['1']);
		expect(feed.pending.map((s) => s.id)).toEqual(['2', '3']);

		feed.applyPending();

		expect(feed.items.map((s) => s.id)).toEqual(['2', '3', '1']);
		expect(feed.pending).toEqual([]);
	});

	it('behält Beiträge, die während des ersten Ladens eintreffen', async () => {
		let release: (items: Status[]) => void = () => {};
		const loader = vi.fn(
			() =>
				new Promise<Status[]>((resolve) => {
					release = resolve;
				})
		);
		const feed = new TimelineFeed(loader);

		const firstLoad = feed.load();
		feed.prepend(status('2'));
		release([status('1')]);
		await firstLoad;

		expect(feed.items.map((s) => s.id)).toEqual(['2', '1']);
		expect(feed.pending).toEqual([]);
	});

	it('ignoriert Duplikate in der Liste und im Puffer', async () => {
		const feed = await loadedFeed();

		feed.prepend(status('1'));
		feed.prepend(status('2'));
		feed.prepend(status('2'));

		expect(feed.items.map((s) => s.id)).toEqual(['1']);
		expect(feed.pending.map((s) => s.id)).toEqual(['2']);
	});

	it('mischt gepufferte Beiträge beim Nachladen in der richtigen Reihenfolge ein', async () => {
		const loader = vi.fn(async ({ sinceId }: { sinceId?: string }) =>
			sinceId ? [status('4')] : [status('1')]
		);
		const feed = await loadedFeed(loader);

		feed.prepend(status('3'));
		feed.prepend(status('2'));
		await feed.loadNew();

		expect(feed.items.map((s) => s.id)).toEqual(['4', '2', '3', '1']);
		expect(feed.pending).toEqual([]);
	});
});

describe('TimelineFeed.remove', () => {
	it('drops the status and any boost wrapper around it', () => {
		const feed = new TimelineFeed(vi.fn());
		feed.items = [
			status('other'),
			{ id: 'boost', reblog: status('target') } as Status,
			status('target')
		];

		feed.remove('target');

		expect(feed.items.map((s) => s.id)).toEqual(['other']);
	});
});

import { describe, expect, it, vi } from 'vitest';
import type { Notification, Status } from '#lib/api/types.ts';
import { NotificationsFeed } from './notifications.svelte.ts';

function notification(id: string): Notification {
	return { id } as Notification;
}

describe('NotificationsFeed.loadNew', () => {
	it('prepends new notifications and counts them as unread', async () => {
		const loader = vi.fn(async ({ sinceId }: { sinceId?: string }) =>
			sinceId === '2'
				? [notification('4'), notification('3')]
				: [notification('2'), notification('1')]
		);
		const feed = new NotificationsFeed(loader);

		await feed.load();
		expect(feed.unread).toBe(0);

		await feed.loadNew();

		expect(feed.items.map((n) => n.id)).toEqual(['4', '3', '2', '1']);
		expect(feed.unread).toBe(2);
	});

	it('does not double-count already known notifications', async () => {
		const loader = vi.fn(async ({ sinceId }: { sinceId?: string }) =>
			sinceId ? [notification('2'), notification('1')] : [notification('2'), notification('1')]
		);
		const feed = new NotificationsFeed(loader);

		await feed.load();
		await feed.loadNew();

		expect(feed.items.map((n) => n.id)).toEqual(['2', '1']);
		expect(feed.unread).toBe(0);
	});
});

describe('NotificationsFeed.replaceStatus', () => {
	it('swaps in the edited status wherever it appears, and only there', () => {
		const feed = new NotificationsFeed(vi.fn());
		const withStatus = {
			id: 'n1',
			status: { id: 's1', content: '<p>alt</p>' }
		} as unknown as Notification;
		const withoutStatus = { id: 'n2', account: { id: 'a1' } } as unknown as Notification;
		const other = {
			id: 'n3',
			status: { id: 's2', content: '<p>fremd</p>' }
		} as unknown as Notification;
		feed.items = [withStatus, withoutStatus, other];

		feed.replaceStatus({ id: 's1', content: '<p>neu</p>' } as Status);

		expect(feed.items[0]).not.toBe(withStatus);
		expect(feed.items[0].status?.content).toBe('<p>neu</p>');
		expect(feed.items[1].status).toBeUndefined();
		expect(feed.items[2].status?.content).toBe('<p>fremd</p>');
	});
});

describe('NotificationsFeed.removeStatus', () => {
	it('drops only the notifications embedding the deleted status', () => {
		const feed = new NotificationsFeed(vi.fn());
		feed.items = [
			{ id: 'n1', status: { id: 's1' } },
			{ id: 'n2', account: { id: 'a1' } },
			{ id: 'n3', status: { id: 's2' } }
		] as unknown as Notification[];

		feed.removeStatus('s1');

		expect(feed.items.map((n) => n.id)).toEqual(['n2', 'n3']);
	});
});

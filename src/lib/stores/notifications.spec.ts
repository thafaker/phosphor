import { describe, expect, it, vi } from 'vitest';
import type { Notification } from '#lib/api/types.ts';
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

import { getNotifications } from '#lib/api/gotosocial.ts';
import type { Notification } from '#lib/api/types.ts';

const PAGE_SIZE = 20;

function dedupe(notifications: Notification[]): Notification[] {
	const seen = new Set<string>();
	const out: Notification[] = [];
	for (const item of notifications) {
		if (!item?.id || seen.has(item.id)) continue;
		seen.add(item.id);
		out.push(item);
	}
	return out;
}

class NotificationsFeed {
	items = $state<Notification[]>([]);
	loading = $state(false);
	loaded = $state(false);
	unread = $state(0);
	error = $state<string | null>(null);

	async load(force = false): Promise<void> {
		if (this.loading || (this.loaded && !force)) return;
		this.loading = true;
		this.error = null;
		try {
			this.items = dedupe(await getNotifications({ limit: PAGE_SIZE }));
			this.loaded = true;
		} catch (err) {
			this.error =
				err instanceof Error ? err.message : 'Benachrichtigungen konnten nicht geladen werden.';
		} finally {
			this.loading = false;
		}
	}

	async loadMore(): Promise<void> {
		if (this.loading) return;
		const oldest = this.items.at(-1)?.id;
		if (!oldest) return;
		this.loading = true;
		this.error = null;
		try {
			const older = await getNotifications({ limit: PAGE_SIZE, maxId: oldest });
			this.items = dedupe([...this.items, ...older]);
		} catch (err) {
			this.error =
				err instanceof Error
					? err.message
					: 'Ältere Benachrichtigungen konnten nicht geladen werden.';
		} finally {
			this.loading = false;
		}
	}

	/** New notification arrived over the stream. */
	prepend(notification: Notification): void {
		if (this.items.some((item) => item.id === notification.id)) return;
		this.items = [notification, ...this.items];
		this.unread += 1;
	}

	markAllRead(): void {
		this.unread = 0;
	}

	reset(): void {
		this.items = [];
		this.loaded = false;
		this.unread = 0;
		this.error = null;
	}
}

export const notificationsFeed = new NotificationsFeed();

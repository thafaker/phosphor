import { getNotifications, type TimelineParams } from '#lib/api/gotosocial.ts';
import type { Notification, Status } from '#lib/api/types.ts';

const PAGE_SIZE = 20;

export type NotificationsLoader = (
	params: TimelineParams & { types?: string[] }
) => Promise<Notification[]>;

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

export class NotificationsFeed {
	items = $state<Notification[]>([]);
	loading = $state(false);
	loaded = $state(false);
	unread = $state(0);
	error = $state<string | null>(null);

	/** True while a background "pull newer" refresh is in flight. */
	private refreshing = false;

	constructor(private readonly loader: NotificationsLoader) {}

	async load(force = false): Promise<void> {
		if (this.loading || (this.loaded && !force)) return;
		this.loading = true;
		this.error = null;
		try {
			this.items = dedupe(await this.loader({ limit: PAGE_SIZE }));
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
			const older = await this.loader({ limit: PAGE_SIZE, maxId: oldest });
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

	/** Swap in a freshly loaded copy of the status embedded in any notification. */
	replaceStatus(status: Status): void {
		this.items = this.items.map((item) =>
			item.status?.id === status.id ? { ...item, status } : item
		);
	}

	/**
	 * Pull anything newer than what we have (see `TimelineFeed.loadNew`). New
	 * items also bump the unread counter, since they arrived while the stream
	 * was down. Silent on failure.
	 */
	async loadNew(): Promise<void> {
		if (this.refreshing || !this.loaded) return;
		this.refreshing = true;
		try {
			const sinceId = this.items[0]?.id;
			const fresh = await this.loader({ limit: PAGE_SIZE, sinceId });
			if (fresh.length) {
				const merged = dedupe([...fresh, ...this.items]);
				this.unread += merged.length - this.items.length;
				this.items = merged;
			}
		} catch {
			// handled on the next resume / reconnect
		} finally {
			this.refreshing = false;
		}
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

export const notificationsFeed = new NotificationsFeed((params) => getNotifications(params));

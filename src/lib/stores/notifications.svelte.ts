import { getNotifications, type TimelineParams } from '#lib/api/gotosocial.ts';
import type { Notification, Status } from '#lib/api/types.ts';

const PAGE_SIZE = 20;

/**
 * Read state is kept here rather than on the server: GoToSocial (0.22) only
 * offers `POST /api/v1/notifications/clear` for *all* notifications, with no
 * per-notification "read" or "dismiss" endpoint. So we remember locally which
 * ones the user has acknowledged.
 *
 * Two pieces, because they answer different questions:
 * - `readUpTo` is a timestamp watermark: everything older than the last
 *   "mark all read" is read. Survives reloads, and does not grow forever.
 * - `readIds` catches individual notifications acknowledged *below* the
 *   watermark (newest-first list, so a user can skip the top one).
 */
const STORAGE_KEY = 'phosphor:notifications:read:v1';
/** Upper bound for individually acknowledged ids (oldest fall off). */
const MAX_READ_IDS = 500;

interface PersistedReadState {
	readUpTo: string | null;
	readIds: string[];
}

function loadReadState(): PersistedReadState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { readUpTo: null, readIds: [] };
		const parsed = JSON.parse(raw) as Partial<PersistedReadState>;
		return {
			readUpTo: typeof parsed.readUpTo === 'string' ? parsed.readUpTo : null,
			readIds: Array.isArray(parsed.readIds)
				? parsed.readIds.filter((id): id is string => typeof id === 'string')
				: []
		};
	} catch {
		return { readUpTo: null, readIds: [] };
	}
}

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
	/**
	 * Notifications that arrived while the user was scrolled down. See
	 * `TimelineFeed.pending`; the list applies them only when the user is at
	 * the top so the reading position never moves.
	 */
	pending = $state<Notification[]>([]);
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);

	/** Everything created at or before this instant counts as read. */
	#readUpTo = $state<string | null>(null);
	/** Individually acknowledged ids (below the watermark). */
	#readIds = $state<string[]>([]);

	/** True while a background "pull newer" refresh is in flight. */
	private refreshing = false;

	constructor(private readonly loader: NotificationsLoader) {
		const persisted = loadReadState();
		this.#readUpTo = persisted.readUpTo;
		this.#readIds = persisted.readIds;
	}

	/**
	 * Number of loaded notifications the user has not acknowledged yet. Drives
	 * the dot on the bell; like every other feed count it reflects what has been
	 * loaded, and grows as more pages arrive.
	 */
	get unread(): number {
		let count = 0;
		for (const item of [...this.pending, ...this.items]) {
			if (!this.isRead(item)) count += 1;
		}
		return count;
	}

	isRead(notification: Notification): boolean {
		if (this.#readIds.includes(notification.id)) return true;
		if (!this.#readUpTo) return false;
		return notification.created_at <= this.#readUpTo;
	}

	async load(force = false): Promise<void> {
		if (this.loading || (this.loaded && !force)) return;
		this.loading = true;
		this.error = null;
		try {
			const fresh = await this.loader({ limit: PAGE_SIZE });
			// A notification buffered while the first page was in flight arrived
			// after the previous state and can be newer than the fetched page.
			this.items = dedupe([...this.pending, ...fresh]);
			this.pending = [];
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

	/** New notification arrived over the stream. Buffered until applied. */
	prepend(notification: Notification): void {
		if (this.items.some((item) => item.id === notification.id)) return;
		if (this.pending.some((item) => item.id === notification.id)) return;
		this.pending = [notification, ...this.pending];
	}

	/** Insert buffered stream notifications at the top (only when scrolled to the top). */
	applyPending(): void {
		if (!this.pending.length) return;
		this.items = dedupe([...this.pending, ...this.items]);
		this.pending = [];
	}

	/** Swap in a freshly loaded copy of the status embedded in any notification. */
	replaceStatus(status: Status): void {
		const replace = (item: Notification) =>
			item.status?.id === status.id ? { ...item, status } : item;
		this.items = this.items.map(replace);
		this.pending = this.pending.map(replace);
	}

	/**
	 * Pull anything newer than what we have (see `TimelineFeed.loadNew`). New
	 * items arrive unread, since they are newer than the watermark.
	 */
	async loadNew(): Promise<void> {
		if (this.refreshing || !this.loaded) return;
		this.refreshing = true;
		try {
			const sinceId = this.items[0]?.id;
			const fresh = await this.loader({ limit: PAGE_SIZE, sinceId });
			if (fresh.length) {
				this.items = dedupe([...fresh, ...this.pending, ...this.items]);
				this.pending = [];
			}
		} catch {
			// handled on the next resume / reconnect
		} finally {
			this.refreshing = false;
		}
	}

	/** Acknowledge a single notification (e.g. after it was looked at). */
	markRead(notification: Notification): void {
		if (this.isRead(notification)) return;
		this.#readIds = [...this.#readIds, notification.id].slice(-MAX_READ_IDS);
		this.persist();
	}

	/**
	 * Acknowledge everything currently loaded, and everything older. The
	 * watermark is the newest known notification (including buffered ones),
	 * not the wall clock: anything created afterwards (i.e. not yet fetched)
	 * stays unread.
	 */
	markAllRead(): void {
		this.#readUpTo =
			this.pending[0]?.created_at ?? this.items[0]?.created_at ?? new Date().toISOString();
		this.#readIds = [];
		this.persist();
	}

	private persist(): void {
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					readUpTo: this.#readUpTo,
					readIds: this.#readIds
				} satisfies PersistedReadState)
			);
		} catch {
			// ignore (storage disabled)
		}
	}

	/** Drop notifications that embed the given (deleted) status. */
	removeStatus(id: string): void {
		const keep = (item: Notification) => item.status?.id !== id;
		this.items = this.items.filter(keep);
		this.pending = this.pending.filter(keep);
	}

	reset(): void {
		this.items = [];
		this.pending = [];
		this.loaded = false;
		this.error = null;
		this.#readUpTo = null;
		this.#readIds = [];
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// ignore
		}
	}
}

export type NotificationsLoader = (params: TimelineParams) => Promise<Notification[]>;

export const notificationsFeed = new NotificationsFeed((params) => getNotifications(params));

import { homeTimeline, publicTimeline } from '#lib/api/gotosocial.ts';
import type { Status } from '#lib/api/types.ts';
import { session } from '#lib/auth/session.svelte.ts';
import { t } from '#lib/i18n/index.svelte.ts';
import { instance } from '#lib/instance.svelte.ts';
import { offlineKey, readCachedList, writeCachedList } from '#lib/utils/offline.ts';

const PAGE_SIZE = 20;

export type TimelineLoader = (params: {
	limit?: number;
	maxId?: string;
	sinceId?: string;
}) => Promise<Status[]>;

function dedupe(statuses: Status[]): Status[] {
	const seen = new Set<string>();
	const out: Status[] = [];
	for (const status of statuses) {
		if (!status?.id || seen.has(status.id)) continue;
		seen.add(status.id);
		out.push(status);
	}
	return out;
}

/** A paginated timeline backed by any loader (home, local, …). */
export class TimelineFeed {
	items = $state<Status[]>([]);
	/**
	 * Items that arrived while the user was scrolled down. They are not in the
	 * DOM yet, so inserting them cannot move the reading position; the view
	 * shows a hint and applies them when the user is ready.
	 */
	pending = $state<Status[]>([]);
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);
	/**
	 * True when the list comes from the offline cache and the last refresh
	 * failed. The view shows a quiet hint instead of a red error: the content is
	 * still readable, it is just not fresh.
	 */
	stale = $state(false);

	/** True while a background "pull newer" refresh is in flight. */
	private refreshing = false;

	/** Newest id we have seen, so `loadNew()` can ask only for the gap. */
	private newestId(): string | undefined {
		return this.items[0]?.id;
	}

	/**
	 * @param loader Fetches a page from the API.
	 * @param cacheName Offline cache slot (e.g. `home`). Omitted for feeds whose
	 *   first page is not worth keeping between launches.
	 */
	constructor(
		private readonly loader: TimelineLoader,
		private readonly cacheName?: string
	) {}

	/** Per-instance and per-account key, so cached posts never leak between logins. */
	private cacheKey(): string | null {
		if (!this.cacheName || !instance.url || !session.account) return null;
		return offlineKey(this.cacheName, `${instance.url}|${session.account.id}`);
	}

	/** Show the last cached page immediately (offline start). */
	private hydrate(): void {
		if (this.items.length || this.loaded) return;
		const key = this.cacheKey();
		if (!key) return;
		const cached = readCachedList<Status>(key);
		if (!cached) return;
		this.items = dedupe(cached.items);
	}

	private save(): void {
		const key = this.cacheKey();
		if (key) writeCachedList(key, this.items, PAGE_SIZE);
	}

	async load(force = false): Promise<void> {
		if (this.loading || (this.loaded && !force)) return;
		this.hydrate();
		this.loading = true;
		this.error = null;
		try {
			const fresh = await this.loader({ limit: PAGE_SIZE });
			// A status buffered while the first page was in flight arrived after
			// our previous state and is newer than the fetched page.
			this.items = dedupe([...this.pending, ...fresh]);
			this.pending = [];
			this.loaded = true;
			this.stale = false;
			this.save();
		} catch (err) {
			// A cached page turns a network error into an offline view; without
			// one there is nothing to show, so keep the normal error state.
			if (this.items.length) {
				this.loaded = true;
				this.stale = true;
			} else {
				this.error = err instanceof Error ? err.message : t('timeline.loadFailed');
			}
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
			this.save();
		} catch (err) {
			this.error = err instanceof Error ? err.message : t('timeline.loadMoreFailed');
		} finally {
			this.loading = false;
		}
	}

	/**
	 * Fetch everything newer than what we already have and prepend it, without
	 * touching the rest of the list. Used when the app comes back to the
	 * foreground: while it was suspended the WebSocket was dead and the stream
	 * cannot replay missed events, so we pull the gap from the API.
	 *
	 * Unlike `load(true)` this never resets the list, so pagination and the
	 * scroll position survive. Errors are swallowed on purpose — this is a
	 * best-effort background refresh; the stream or the next resume will retry.
	 */
	async loadNew(): Promise<void> {
		if (this.refreshing || !this.loaded) return;
		this.refreshing = true;
		try {
			const sinceId = this.newestId();
			const fresh = await this.loader({ limit: PAGE_SIZE, sinceId });
			this.stale = false;
			if (fresh.length) {
				// Flush pending items in the same step so the order stays correct:
				// fresh API items are newer than anything the stream buffered.
				this.items = dedupe([...fresh, ...this.pending, ...this.items]);
				this.pending = [];
				this.save();
			}
		} catch {
			// handled on the next resume / reconnect
		} finally {
			this.refreshing = false;
		}
	}

	/**
	 * New status arrived over the stream. Keep it out of `items` until the view
	 * decides it is safe to insert (at the top of the timeline) — see
	 * `applyPending()`.
	 */
	prepend(status: Status): void {
		if (this.items.some((item) => item.id === status.id)) return;
		if (this.pending.some((item) => item.id === status.id)) return;
		this.pending = [status, ...this.pending];
	}

	/** Insert buffered stream items at the top. The caller ensures we are at the top. */
	applyPending(): void {
		if (!this.pending.length) return;
		this.items = dedupe([...this.pending, ...this.items]);
		this.pending = [];
		this.save();
	}

	remove(id: string): void {
		// Also drop boosts that surface the deleted status, otherwise a wrapper
		// whose original is gone would linger in the timeline.
		this.items = this.items.filter((item) => item.id !== id && item.reblog?.id !== id);
		this.pending = this.pending.filter((item) => item.id !== id && item.reblog?.id !== id);
		this.save();
	}

	replace(status: Status): void {
		this.items = this.items.map((item) => (item.id === status.id ? status : item));
		this.pending = this.pending.map((item) => (item.id === status.id ? status : item));
	}

	reset(): void {
		this.items = [];
		this.pending = [];
		this.loaded = false;
		this.error = null;
		this.stale = false;
	}
}

export const homeFeed = new TimelineFeed((params) => homeTimeline(params), 'home');
export const localFeed = new TimelineFeed(
	(params) => publicTimeline({ ...params, local: true }),
	'local'
);

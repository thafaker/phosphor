import { homeTimeline, publicTimeline } from '#lib/api/gotosocial.ts';
import type { Status } from '#lib/api/types.ts';

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

	/** True while a background "pull newer" refresh is in flight. */
	private refreshing = false;

	/** Newest id we have seen, so `loadNew()` can ask only for the gap. */
	private newestId(): string | undefined {
		return this.items[0]?.id;
	}

	constructor(private readonly loader: TimelineLoader) {}

	async load(force = false): Promise<void> {
		if (this.loading || (this.loaded && !force)) return;
		this.loading = true;
		this.error = null;
		try {
			const fresh = await this.loader({ limit: PAGE_SIZE });
			// A status buffered while the first page was in flight arrived after
			// our previous state and is newer than the fetched page.
			this.items = dedupe([...this.pending, ...fresh]);
			this.pending = [];
			this.loaded = true;
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Timeline konnte nicht geladen werden.';
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
				err instanceof Error ? err.message : 'Ältere Beiträge konnten nicht geladen werden.';
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
			if (fresh.length) {
				// Flush pending items in the same step so the order stays correct:
				// fresh API items are newer than anything the stream buffered.
				this.items = dedupe([...fresh, ...this.pending, ...this.items]);
				this.pending = [];
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
	}

	remove(id: string): void {
		// Also drop boosts that surface the deleted status, otherwise a wrapper
		// whose original is gone would linger in the timeline.
		this.items = this.items.filter((item) => item.id !== id && item.reblog?.id !== id);
		this.pending = this.pending.filter((item) => item.id !== id && item.reblog?.id !== id);
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
	}
}

export const homeFeed = new TimelineFeed((params) => homeTimeline(params));
export const localFeed = new TimelineFeed((params) => publicTimeline({ ...params, local: true }));

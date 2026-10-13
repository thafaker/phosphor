import { homeTimeline, publicTimeline } from '#lib/api/gotosocial.ts';
import type { Status } from '#lib/api/types.ts';

const PAGE_SIZE = 20;

export type TimelineLoader = (params: { limit?: number; maxId?: string }) => Promise<Status[]>;

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
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);

	constructor(private readonly loader: TimelineLoader) {}

	async load(force = false): Promise<void> {
		if (this.loading || (this.loaded && !force)) return;
		this.loading = true;
		this.error = null;
		try {
			this.items = dedupe(await this.loader({ limit: PAGE_SIZE }));
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

	/** New status arrived over the stream. */
	prepend(status: Status): void {
		if (!this.loaded || this.items.some((item) => item.id === status.id)) return;
		this.items = [status, ...this.items];
	}

	remove(id: string): void {
		this.items = this.items.filter((item) => item.id !== id);
	}

	replace(status: Status): void {
		this.items = this.items.map((item) => (item.id === status.id ? status : item));
	}

	reset(): void {
		this.items = [];
		this.loaded = false;
		this.error = null;
	}
}

export const homeFeed = new TimelineFeed((params) => homeTimeline(params));
export const localFeed = new TimelineFeed((params) => publicTimeline({ ...params, local: true }));

import { deleteConversation, getConversations, markConversationRead } from '#lib/api/gotosocial.ts';
import type { Conversation, Status } from '#lib/api/types.ts';
import { session } from '#lib/auth/session.svelte.ts';
import { t } from '#lib/i18n/index.svelte.ts';
import { instance } from '#lib/instance.svelte.ts';
import { offlineKey, readCachedList, writeCachedList } from '#lib/utils/offline.ts';

const PAGE_SIZE = 20;

function dedupe(conversations: Conversation[]): Conversation[] {
	const seen = new Set<string>();
	const out: Conversation[] = [];
	for (const item of conversations) {
		if (!item?.id || seen.has(item.id)) continue;
		seen.add(item.id);
		out.push(item);
	}
	return out;
}

/**
 * Direct-message inbox, backed by the Mastodon-compatible conversations API.
 *
 * Unlike notifications, read state lives on the server (`conversation.unread`
 * and `POST /conversations/:id/read`), so we keep the list in sync with the
 * API and update it optimistically on user actions.
 */
export class ConversationsFeed {
	items = $state<Conversation[]>([]);
	/** Stream/refetch updates buffered while the user is scrolled down. */
	pending = $state<Conversation[]>([]);
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);
	/** The list was restored from the offline cache; the last refresh failed. */
	stale = $state(false);

	/** True while a background "pull newer" refresh is in flight. */
	private refreshing = false;

	/** Per-instance and per-account key, so cached conversations never leak. */
	private cacheKey(): string | null {
		if (!instance.url || !session.account) return null;
		return offlineKey('conversations', `${instance.url}|${session.account.id}`);
	}

	private hydrate(): void {
		if (this.items.length || this.loaded) return;
		const key = this.cacheKey();
		if (!key) return;
		const cached = readCachedList<Conversation>(key);
		if (!cached) return;
		this.items = dedupe(cached.items);
	}

	private save(): void {
		const key = this.cacheKey();
		if (key) writeCachedList(key, this.items, PAGE_SIZE);
	}

	get unread(): number {
		let count = 0;
		for (const item of [...this.pending, ...this.items]) {
			if (item.unread) count += 1;
		}
		return count;
	}

	async load(force = false): Promise<void> {
		if (this.loading || (this.loaded && !force)) return;
		this.hydrate();
		this.loading = true;
		this.error = null;
		try {
			const fresh = await getConversations({ limit: PAGE_SIZE });
			// Pending updates may be newer than the fetched page.
			this.items = dedupe(this.mergePendingInto(fresh));
			this.pending = [];
			this.loaded = true;
			this.stale = false;
			this.save();
		} catch (err) {
			if (this.items.length) {
				this.loaded = true;
				this.stale = true;
			} else {
				this.error = err instanceof Error ? err.message : t('messages.loadFailed');
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
			const older = await getConversations({ limit: PAGE_SIZE, maxId: oldest });
			this.items = dedupe([...this.items, ...older]);
			this.save();
		} catch (err) {
			this.error = err instanceof Error ? err.message : t('messages.loadMoreFailed');
		} finally {
			this.loading = false;
		}
	}

	/**
	 * Pull anything newer than what we have. Conversations can also be updated
	 * (new message/unread), so merge by id and move refreshed entries to the top.
	 */
	async loadNew(): Promise<void> {
		if (this.refreshing || !this.loaded) return;
		this.refreshing = true;
		try {
			const sinceId = this.items[0]?.id;
			const fresh = await getConversations({ limit: PAGE_SIZE, sinceId });
			this.stale = false;
			if (fresh.length) {
				this.items = dedupe(this.mergeFresh([...fresh, ...this.pending], this.items));
				this.pending = [];
				this.save();
			} else if (this.pending.length) {
				this.applyPending();
			}
		} catch {
			// handled on the next resume / reconnect
		} finally {
			this.refreshing = false;
		}
	}

	/** Merge a set of (possibly updated) conversations ahead of the existing list. */
	private mergeFresh(fresh: Conversation[], existing: Conversation[]): Conversation[] {
		const byId = new Map(existing.map((item) => [item.id, item]));
		for (const item of fresh) byId.set(item.id, item);
		const freshIds = new Set(fresh.map((item) => item.id));
		const rest = existing.filter((item) => !freshIds.has(item.id));
		return [...fresh, ...rest];
	}

	private mergePendingInto(base: Conversation[]): Conversation[] {
		if (!this.pending.length) return base;
		return this.mergeFresh(this.pending, base);
	}

	/** Insert or update a conversation (e.g. from the stream). Buffered until applied. */
	upsert(conversation: Conversation): void {
		if (!conversation?.id) return;
		const without = this.pending.filter((item) => item.id !== conversation.id);
		this.pending = [conversation, ...without];
	}

	/** Insert buffered updates at the top (only when scrolled to the top). */
	applyPending(): void {
		if (!this.pending.length) return;
		this.items = dedupe(this.mergeFresh(this.pending, this.items));
		this.pending = [];
		this.save();
	}

	/** Optimistically mark a conversation as read and sync with the server. */
	async markRead(id: string): Promise<void> {
		const update = (item: Conversation) => (item.id === id ? { ...item, unread: false } : item);
		const hadUnread = this.items.some((item) => item.id === id && item.unread);
		if (!hadUnread && !this.pending.some((item) => item.id === id && item.unread)) return;
		this.items = this.items.map(update);
		this.pending = this.pending.map(update);
		this.save();
		try {
			const updated = await markConversationRead(id);
			if (updated?.id) this.replaceConversation(updated);
		} catch {
			// best effort: local state stays read
		}
	}

	/** Remove a conversation from the inbox. */
	async remove(id: string): Promise<void> {
		const previousItems = this.items;
		const previousPending = this.pending;
		this.items = this.items.filter((item) => item.id !== id);
		this.pending = this.pending.filter((item) => item.id !== id);
		this.save();
		try {
			await deleteConversation(id);
		} catch (err) {
			this.items = previousItems;
			this.pending = previousPending;
			this.save();
			this.error = err instanceof Error ? err.message : t('common.actionFailed');
			throw err;
		}
	}

	private replaceConversation(conversation: Conversation): void {
		const replace = (item: Conversation) => (item.id === conversation.id ? conversation : item);
		if (this.items.some((item) => item.id === conversation.id)) {
			this.items = this.items.map(replace);
		}
		if (this.pending.some((item) => item.id === conversation.id)) {
			this.pending = this.pending.map(replace);
		}
		this.save();
	}

	/** Swap in an edited status if it is the last message of any conversation. */
	replaceStatus(status: Status): void {
		const replace = (item: Conversation) =>
			item.last_status?.id === status.id ? { ...item, last_status: status } : item;
		this.items = this.items.map(replace);
		this.pending = this.pending.map(replace);
		this.save();
	}

	/** Drop conversations whose last message was deleted. */
	removeStatus(id: string): void {
		const affected = (item: Conversation) => item.last_status?.id === id;
		if (!this.items.some(affected) && !this.pending.some(affected)) return;
		// Without the last message the preview is stale; refetch to get the
		// server's current view (it may remove or re-point the conversation).
		this.items = this.items.filter((item) => !affected(item));
		this.pending = this.pending.filter((item) => !affected(item));
		this.save();
		void this.loadNew();
	}

	reset(): void {
		this.items = [];
		this.pending = [];
		this.loaded = false;
		this.error = null;
		this.stale = false;
		this.loading = false;
		this.refreshing = false;
	}
}

export const conversationsFeed = new ConversationsFeed();

import type { Status } from '#lib/api/types.ts';

/**
 * Pure helpers behind the live thread view. The page keeps three lists
 * (ancestors, the status itself, descendants) and these functions say what a
 * stream event does to them — kept apart from Svelte so they can be tested.
 */

/** True when the given status sits anywhere in the thread we are showing. */
export function threadHas(thread: Status[], id: string): boolean {
	return thread.some((item) => item.id === id || item.reblog?.id === id);
}

/**
 * Insert a status that arrived over the stream (a new post from someone we
 * follow) when it belongs to the open conversation.
 *
 * Only direct replies to a status we already show are accepted, plus replies to
 * the root: anything deeper whose parent is still missing would land in the
 * wrong place, and the next full context load picks it up instead.
 *
 * @returns a new array, or `null` when the status does not belong here. The new
 *          status is appended (GoToSocial's context is oldest-first).
 */
export function insertReply(
	descendants: Status[],
	rootId: string,
	incoming: Status
): Status[] | null {
	const parentId = incoming.in_reply_to_id;
	if (!parentId) return null;
	if (incoming.id === rootId || threadHas(descendants, incoming.id)) return null;
	if (parentId !== rootId && !threadHas(descendants, parentId)) return null;
	return [...descendants, incoming];
}

/**
 * Swap in a freshly fetched revision of a status (edit, new counts) without
 * dropping the thread's own identity for it: the arrays are rebuilt, but the
 * objects are patched in place so cards keep their state (e.g. an opened CW).
 */
export function applyThreadRevision(thread: Status[], updated: Status): void {
	for (const item of thread) {
		if (item.id === updated.id) {
			mergeStatus(item, updated);
			return;
		}
		// A boost wrapper is never edited itself — its original is.
		if (item.reblog?.id === updated.id) {
			mergeStatus(item.reblog, updated);
			return;
		}
	}
}

/** Copy every field the timeline renders from `from` onto `into`. */
export function mergeStatus(into: Status, from: Status): void {
	into.content = from.content;
	into.spoiler_text = from.spoiler_text;
	into.sensitive = from.sensitive;
	into.edited_at = from.edited_at;
	into.language = from.language;
	into.url = from.url;
	into.media_attachments = from.media_attachments;
	into.mentions = from.mentions;
	into.tags = from.tags;
	into.card = from.card;
	into.poll = from.poll;
	into.replies_count = from.replies_count;
	into.reblogs_count = from.reblogs_count;
	into.favourites_count = from.favourites_count;
	into.favourited = from.favourited;
	into.reblogged = from.reblogged;
	into.bookmarked = from.bookmarked;
}

/** Remove a status (and any boost wrapper of it) from a thread list. */
export function removeFromThread(thread: Status[], id: string): Status[] {
	return thread.filter((item) => item.id !== id && item.reblog?.id !== id);
}

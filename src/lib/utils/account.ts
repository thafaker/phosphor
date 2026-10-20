import type { Account, Relationship } from '#lib/api/types.ts';

export type FollowIntent = 'follow' | 'unfollow';

/**
 * Handle to put in front of a reply, or `null` when nothing should be added.
 *
 * GoToSocial builds the mention list — and with it the `to`/`cc` addressing of
 * the federated object — purely from the status text. Without this handle the
 * account being replied to gets no mention notification, and an account that
 * does not follow us does not receive the status at all. Replies to ourselves
 * are skipped: a self-mention would only notify ourselves.
 */
export function replyMention(account: Account, viewer: Account | null): string | null {
	if (viewer && account.id === viewer.id) return null;
	return `@${account.acct}`;
}

/**
 * Which call the follow button should make. A pending follow request counts as
 * "unfollow", because that's how GoToSocial withdraws it
 * (`POST /api/v1/accounts/:id/unfollow`).
 */
export function followIntent(relationship: Relationship | null): FollowIntent {
	if (relationship && (relationship.following || relationship.requested)) return 'unfollow';
	return 'follow';
}

/** Button label, reflecting the current following / pending state. */
export function followLabel(relationship: Relationship | null): string {
	if (relationship?.following) return 'Entfolgen';
	if (relationship?.requested) return 'Angefragt';
	return 'Folgen';
}

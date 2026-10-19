import type { Relationship } from '#lib/api/types.ts';

export type FollowIntent = 'follow' | 'unfollow';

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

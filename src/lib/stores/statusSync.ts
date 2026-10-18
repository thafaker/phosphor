import type { Status } from '#lib/api/types.ts';
import { homeFeed, localFeed } from './feed.svelte.ts';
import { notificationsFeed } from './notifications.svelte.ts';

/**
 * Apply an edited status everywhere it may currently be shown: both timelines
 * and any notification that embeds it.
 *
 * GoToSocial streams a `status.update` event after an edit, but doing this
 * eagerly keeps the UI correct without waiting for the round-trip (and covers
 * the case where the socket is down). Callers that render a status outside a
 * feed (e.g. the thread view) still update their own copy in place.
 */
export function applyStatusUpdate(status: Status): void {
	homeFeed.replace(status);
	localFeed.replace(status);
	notificationsFeed.replaceStatus(status);
}

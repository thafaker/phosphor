import type { Status } from '#lib/api/types.ts';

/**
 * Canonical web URL of a status on the instance that actually hosts it.
 *
 * GoToSocial serves HTML pages only for statuses local to a server; for
 * federated posts the API's `url` points at the origin instance. Some remote
 * implementations omit `url`, so fall back to `uri` (the ActivityPub id, which
 * is usually a web URL too). Same order the GoToSocial docs recommend for
 * permalinks.
 */
export function originalStatusUrl(status: Pick<Status, 'url' | 'uri'>): string | null {
	for (const candidate of [status.url, status.uri]) {
		if (candidate && /^https?:\/\//i.test(candidate)) return candidate;
	}
	return null;
}

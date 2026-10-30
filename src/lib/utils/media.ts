import type { InstanceLimits, MediaType } from '#lib/api/types.ts';

/**
 * An attachment staged in the composer, before the status is sent.
 *
 * Uploading happens on submit (see `Composer.svelte`), not on selection, so an
 * abandoned draft never leaves orphaned media on the server.
 */
export interface MediaDraft {
	/** Stable client-side key (previews are replaced after compression). */
	localId: string;
	file: File;
	/** Local object URL for the preview; must be revoked when discarding. */
	previewUrl: string;
	/** Coarse kind derived from the MIME type, used to pick a preview element. */
	type: MediaType;
	description: string;
	/** Set once the upload succeeded; reused if the post is retried. */
	id?: string;
	uploading?: boolean;
	/** True while the image is being resized/re-encoded in the browser. */
	preparing?: boolean;
	/** Original byte size, when compression replaced the file. */
	originalSize?: number;
	/** Set when the prepared file still violates an instance limit. */
	invalid?: boolean;
	error?: string | null;
}

/** Map a MIME type to the coarse media kind we render (and GtS reports). */
export function mediaTypeFor(mime: string): MediaType {
	if (mime.startsWith('video/')) return 'video';
	if (mime.startsWith('audio/')) return 'audio';
	if (mime.startsWith('image/')) return 'image';
	return 'unknown';
}

export function createMediaDraft(file: File): MediaDraft {
	return {
		localId:
			globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		file,
		previewUrl: URL.createObjectURL(file),
		type: mediaTypeFor(file.type),
		description: ''
	};
}

export function revokeMediaDraft(draft: MediaDraft): void {
	URL.revokeObjectURL(draft.previewUrl);
}

/** Human-readable byte size, rounded to whole units. */
export function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
	if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${bytes} B`;
}

/**
 * Client-side pre-check so an unsupported or oversized file fails instantly,
 * rather than after a long upload. Returns a message, or null when acceptable.
 *
 * `allowOversizeImages` is for the composer: photos above the instance limit
 * may still become acceptable after {@link compressImage} resized them, so the
 * size check happens again on the prepared file.
 */
export function validateMediaFile(
	file: File,
	limits: InstanceLimits,
	options: { allowOversizeImages?: boolean } = {}
): string | null {
	if (limits.supportedMediaTypes.length && !limits.supportedMediaTypes.includes(file.type)) {
		return `Nicht unterstützter Dateityp: ${file.type || file.name}`;
	}
	if (options.allowOversizeImages && file.type.startsWith('image/')) return null;
	const isVideo = file.type.startsWith('video/') || file.type.startsWith('audio/');
	const limit = isVideo ? limits.videoSizeLimit : limits.imageSizeLimit;
	if (limit > 0 && file.size > limit) {
		return `Datei ist zu groß (max. ${formatBytes(limit)}).`;
	}
	return null;
}

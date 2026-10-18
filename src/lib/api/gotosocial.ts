import {
	DEFAULT_MAX_CHARS,
	DEFAULT_MAX_MEDIA_ATTACHMENTS,
	DEFAULT_MEDIA_DESCRIPTION_LIMIT,
	DEFAULT_MEDIA_SIZE_LIMIT
} from '#lib/config.ts';
import { apiRequest } from './client';
import type {
	Account,
	Context,
	InstanceLimits,
	InstanceV1,
	InstanceV2,
	MediaAttachment,
	Notification,
	Status,
	StatusSource,
	Visibility
} from './types';

export interface TimelineParams {
	limit?: number;
	maxId?: string;
	sinceId?: string;
	minId?: string;
}

export function verifyCredentials(): Promise<Account> {
	return apiRequest<Account>('/api/v1/accounts/verify_credentials');
}

export function homeTimeline(params: TimelineParams = {}): Promise<Status[]> {
	return apiRequest<Status[]>('/api/v1/timelines/home', {
		query: { limit: params.limit ?? 20, max_id: params.maxId, since_id: params.sinceId }
	});
}

export function publicTimeline(
	params: TimelineParams & { local?: boolean; remote?: boolean } = {}
): Promise<Status[]> {
	return apiRequest<Status[]>('/api/v1/timelines/public', {
		query: {
			limit: params.limit ?? 20,
			max_id: params.maxId,
			since_id: params.sinceId,
			local: params.local,
			remote: params.remote
		}
	});
}

export function getStatus(id: string): Promise<Status> {
	return apiRequest<Status>(`/api/v1/statuses/${id}`);
}

export function getContext(id: string): Promise<Context> {
	return apiRequest<Context>(`/api/v1/statuses/${id}/context`);
}

export function favourite(id: string): Promise<Status> {
	return apiRequest<Status>(`/api/v1/statuses/${id}/favourite`, { method: 'POST' });
}

export function unfavourite(id: string): Promise<Status> {
	return apiRequest<Status>(`/api/v1/statuses/${id}/unfavourite`, { method: 'POST' });
}

export function reblog(id: string): Promise<Status> {
	return apiRequest<Status>(`/api/v1/statuses/${id}/reblog`, { method: 'POST' });
}

export function unreblog(id: string): Promise<Status> {
	return apiRequest<Status>(`/api/v1/statuses/${id}/unreblog`, { method: 'POST' });
}

export function bookmark(id: string): Promise<Status> {
	return apiRequest<Status>(`/api/v1/statuses/${id}/bookmark`, { method: 'POST' });
}

export function unbookmark(id: string): Promise<Status> {
	return apiRequest<Status>(`/api/v1/statuses/${id}/unbookmark`, { method: 'POST' });
}

export interface PostStatusInput {
	status: string;
	spoilerText?: string;
	visibility?: Visibility;
	inReplyToId?: string;
	sensitive?: boolean;
	language?: string;
	/** Ids of already-uploaded attachments to include. */
	mediaIds?: string[];
}

export function postStatus(input: PostStatusInput): Promise<Status> {
	return apiRequest<Status>('/api/v1/statuses', {
		method: 'POST',
		body: {
			status: input.status,
			spoiler_text: input.spoilerText,
			visibility: input.visibility,
			in_reply_to_id: input.inReplyToId,
			sensitive: input.sensitive,
			language: input.language,
			media_ids: input.mediaIds
		}
	});
}

/** Delete an own status (`DELETE /api/v1/statuses/:id`). */
export function deleteStatus(id: string): Promise<Status> {
	return apiRequest<Status>(`/api/v1/statuses/${id}`, { method: 'DELETE' });
}

export interface UploadMediaInput {
	file: File;
	/** Alt text. Optional, but strongly encouraged — it's the only a11y hook. */
	description?: string;
}

/**
 * Upload an attachment (`POST /api/v2/media`).
 *
 * Unlike Mastodon, GoToSocial does the processing inline and answers `200 OK`
 * with a finished attachment (with `url` already set) instead of `202`, so the
 * caller does not have to poll for the media to become ready.
 *
 * The request is multipart/form-data: `apiRequest` passes a FormData body
 * through untouched so the browser can set the multipart boundary.
 */
export function uploadMedia(input: UploadMediaInput): Promise<MediaAttachment> {
	const form = new FormData();
	form.append('file', input.file, input.file.name);
	if (input.description) form.append('description', input.description);
	return apiRequest<MediaAttachment>('/api/v2/media', { method: 'POST', body: form });
}

/** Raw, unrendered text of a status — the only sane basis for an edit form. */
export function getStatusSource(id: string): Promise<StatusSource> {
	return apiRequest<StatusSource>(`/api/v1/statuses/${id}/source`);
}

export interface EditStatusInput {
	/** Plain text (or Markdown) content, as returned by `getStatusSource`. */
	status: string;
	spoilerText?: string;
	/** GtS' edit form has no optional `sensitive`: omitting it would clear the flag. */
	sensitive?: boolean;
	/** Omitting it makes GtS fall back to the account's default language. */
	language?: string;
	/**
	 * GoToSocial replaces the status' attachments with whatever is sent here, so
	 * the existing media ids must be passed along to keep them
	 * (`internal/processing/status/edit.go`: `status.AttachmentIDs = form.MediaIDs`).
	 */
	mediaIds?: string[];
	/** Likewise, an omitted poll is deleted; resend it to keep it alive. */
	poll?: { options: string[]; multiple: boolean };
}

/**
 * Edit an own status (`PUT /api/v1/statuses/:id`). GoToSocial does not allow
 * changing the visibility through this endpoint. Returns the latest revision.
 */
export function editStatus(id: string, input: EditStatusInput): Promise<Status> {
	return apiRequest<Status>(`/api/v1/statuses/${id}`, {
		method: 'PUT',
		body: {
			status: input.status,
			spoiler_text: input.spoilerText,
			sensitive: input.sensitive,
			language: input.language,
			media_ids: input.mediaIds,
			poll: input.poll
		}
	});
}

export function getNotifications(
	params: TimelineParams & { types?: string[] } = {}
): Promise<Notification[]> {
	return apiRequest<Notification[]>('/api/v1/notifications', {
		query: {
			limit: params.limit ?? 20,
			max_id: params.maxId,
			since_id: params.sinceId,
			types: params.types?.join(',')
		}
	});
}

export function clearNotifications(): Promise<void> {
	return apiRequest<void>('/api/v1/notifications/clear', { method: 'POST' });
}

/**
 * Resolve the limits the composer needs (characters, media count/size).
 *
 * The v2 endpoint is preferred: it's the only one carrying the media
 * configuration, so one request yields every limit we care about.
 */
export async function getInstanceLimits(): Promise<InstanceLimits> {
	try {
		const v2 = await apiRequest<InstanceV2>('/api/v2/instance');
		const statuses = v2.configuration?.statuses;
		const media = v2.configuration?.media_attachments;
		return {
			maxChars: statuses?.max_characters || DEFAULT_MAX_CHARS,
			maxMediaAttachments: statuses?.max_media_attachments || DEFAULT_MAX_MEDIA_ATTACHMENTS,
			imageSizeLimit: media?.image_size_limit || DEFAULT_MEDIA_SIZE_LIMIT,
			videoSizeLimit: media?.video_size_limit || DEFAULT_MEDIA_SIZE_LIMIT,
			descriptionLimit: media?.description_limit || DEFAULT_MEDIA_DESCRIPTION_LIMIT,
			supportedMediaTypes: media?.supported_mime_types ?? []
		};
	} catch {
		// fall through to v1
	}

	try {
		const v1 = await apiRequest<InstanceV1>('/api/v1/instance');
		const maxChars = v1.configuration?.statuses?.max_characters;
		if (maxChars) return { ...fallbackLimits(), maxChars };
	} catch {
		// ignore — use the defaults below
	}

	return fallbackLimits();
}

function fallbackLimits(): InstanceLimits {
	return {
		maxChars: DEFAULT_MAX_CHARS,
		maxMediaAttachments: DEFAULT_MAX_MEDIA_ATTACHMENTS,
		imageSizeLimit: DEFAULT_MEDIA_SIZE_LIMIT,
		videoSizeLimit: DEFAULT_MEDIA_SIZE_LIMIT,
		descriptionLimit: DEFAULT_MEDIA_DESCRIPTION_LIMIT,
		supportedMediaTypes: []
	};
}

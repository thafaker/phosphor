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
	CustomEmoji,
	InstanceLimits,
	InstanceV1,
	InstanceV2,
	MediaAttachment,
	Notification,
	Relationship,
	SearchParams,
	SearchResult,
	Status,
	StatusContentType,
	StatusSource,
	Tag,
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

/** Instance-wide custom emojis (`GET /api/v1/custom_emojis`). */
export function getCustomEmojis(): Promise<CustomEmoji[]> {
	return apiRequest<CustomEmoji[]>('/api/v1/custom_emojis');
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

export function getAccount(id: string): Promise<Account> {
	return apiRequest<Account>(`/api/v1/accounts/${id}`);
}

export interface AccountStatusesParams {
	limit?: number;
	maxId?: string;
	/** Defaults to true on the server as well, but we want it explicit. */
	excludeReplies?: boolean;
	excludeReblogs?: boolean;
	onlyMedia?: boolean;
	pinned?: boolean;
}

export function accountStatuses(id: string, params: AccountStatusesParams = {}): Promise<Status[]> {
	return apiRequest<Status[]>(`/api/v1/accounts/${id}/statuses`, {
		query: {
			limit: params.limit ?? 20,
			max_id: params.maxId,
			exclude_replies: params.excludeReplies,
			exclude_reblogs: params.excludeReblogs,
			only_media: params.onlyMedia,
			pinned: params.pinned
		}
	});
}

/** The viewer's relationship to an account. `null` if the server has none. */
export async function getRelationship(id: string): Promise<Relationship | null> {
	const relationships = await apiRequest<Relationship[]>('/api/v1/accounts/relationships', {
		query: { 'id[]': id }
	});
	return relationships[0] ?? null;
}

/** Follow an account; for a locked account this creates a pending request. */
export function followAccount(id: string): Promise<Relationship> {
	return apiRequest<Relationship>(`/api/v1/accounts/${id}/follow`, { method: 'POST' });
}

/** Unfollow an account — also withdraws a pending follow request. */
export function unfollowAccount(id: string): Promise<Relationship> {
	return apiRequest<Relationship>(`/api/v1/accounts/${id}/unfollow`, { method: 'POST' });
}

export function tagTimeline(
	tag: string,
	params: TimelineParams & { local?: boolean; remote?: boolean; onlyMedia?: boolean } = {}
): Promise<Status[]> {
	return apiRequest<Status[]>(`/api/v1/timelines/tag/${encodeURIComponent(tag)}`, {
		query: {
			limit: params.limit ?? 20,
			max_id: params.maxId,
			since_id: params.sinceId,
			local: params.local,
			remote: params.remote,
			only_media: params.onlyMedia
		}
	});
}

export { type SearchParams } from './types';

export { type SearchResult } from './types';

export function search(params: SearchParams): Promise<SearchResult> {
	return apiRequest<SearchResult>('/api/v2/search', {
		query: {
			q: params.q,
			type: params.type,
			limit: params.limit ?? 20,
			offset: params.offset,
			resolve: params.resolve,
			following: params.following,
			account_id: params.accountId,
			max_id: params.maxId,
			min_id: params.minId
		}
	});
}

export function getHashtag(tag: string): Promise<Tag> {
	return apiRequest<Tag>(`/api/v1/tags/${encodeURIComponent(tag)}`);
}

export function followHashtag(tag: string): Promise<Tag> {
	return apiRequest<Tag>(`/api/v1/tags/${encodeURIComponent(tag)}/follow`, { method: 'POST' });
}

export function unfollowHashtag(tag: string): Promise<Tag> {
	return apiRequest<Tag>(`/api/v1/tags/${encodeURIComponent(tag)}/unfollow`, { method: 'POST' });
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
	/**
	 * The server otherwise falls back to the account setting, which may be
	 * Markdown. Always passing it makes the composer's mode authoritative.
	 */
	contentType?: StatusContentType;
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
			content_type: input.contentType,
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
	/** Keep (or deliberately change) how the text is parsed. */
	contentType?: StatusContentType;
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
			content_type: input.contentType,
			media_ids: input.mediaIds,
			poll: input.poll
		}
	});
}

export function getNotifications(params: TimelineParams = {}): Promise<Notification[]> {
	return apiRequest<Notification[]>('/api/v1/notifications', {
		query: {
			limit: params.limit ?? 20,
			max_id: params.maxId,
			since_id: params.sinceId
		}
	});
}

export function clearNotifications(): Promise<void> {
	return apiRequest<void>('/api/v1/notifications/clear', { method: 'POST' });
}

/**
 * Accounts waiting for us to approve their follow request
 * (`GET /api/v1/follow_requests`). Only ever non-empty for a locked account.
 */
export function getFollowRequests(params: TimelineParams = {}): Promise<Account[]> {
	return apiRequest<Account[]>('/api/v1/follow_requests', {
		query: { limit: params.limit ?? 40, max_id: params.maxId }
	});
}

/** Accept a follow request (`POST /api/v1/follow_requests/:id/authorize`). */
export function authorizeFollowRequest(id: string): Promise<Relationship> {
	return apiRequest<Relationship>(`/api/v1/follow_requests/${id}/authorize`, { method: 'POST' });
}

/** Reject a follow request (`POST /api/v1/follow_requests/:id/reject`). */
export function rejectFollowRequest(id: string): Promise<Relationship> {
	return apiRequest<Relationship>(`/api/v1/follow_requests/${id}/reject`, { method: 'POST' });
}

/** Block an account; GoToSocial drops the follow relationships on both sides. */
export function blockAccount(id: string): Promise<Relationship> {
	return apiRequest<Relationship>(`/api/v1/accounts/${id}/block`, { method: 'POST' });
}

export function unblockAccount(id: string): Promise<Relationship> {
	return apiRequest<Relationship>(`/api/v1/accounts/${id}/unblock`, { method: 'POST' });
}

/**
 * Mute an account (`POST /api/v1/accounts/:id/mute`).
 *
 * `notifications` defaults to *false* in GoToSocial, which would let their
 * mentions and favourites keep buzzing — so we always ask for `true` here.
 */
export function muteAccount(id: string, notifications = true): Promise<Relationship> {
	return apiRequest<Relationship>(`/api/v1/accounts/${id}/mute`, {
		method: 'POST',
		body: { notifications }
	});
}

export function unmuteAccount(id: string): Promise<Relationship> {
	return apiRequest<Relationship>(`/api/v1/accounts/${id}/unmute`, { method: 'POST' });
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

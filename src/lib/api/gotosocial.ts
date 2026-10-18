import { DEFAULT_MAX_CHARS } from '#lib/config.ts';
import { apiRequest } from './client';
import type {
	Account,
	Context,
	InstanceV1,
	InstanceV2,
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
			language: input.language
		}
	});
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

/** Best-effort lookup of the instance's post character limit. */
export async function getInstanceLimit(): Promise<number> {
	try {
		const v2 = await apiRequest<InstanceV2>('/api/v2/instance');
		const limit = v2.configuration?.statuses?.max_characters;
		if (limit) return limit;
	} catch {
		// fall through to v1
	}
	try {
		const v1 = await apiRequest<InstanceV1>('/api/v1/instance');
		const limit = v1.configuration?.statuses?.max_characters;
		if (limit) return limit;
	} catch {
		// ignore — use the default below
	}
	return DEFAULT_MAX_CHARS;
}

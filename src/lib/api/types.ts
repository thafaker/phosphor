// A pragmatic subset of the Mastodon-compatible API types that GoToSocial
// implements. We only declare what Phosphor actually uses.

export interface CustomEmoji {
	shortcode: string;
	url: string;
	static_url: string;
	visible_in_picker: boolean;
	category?: string;
}

export interface AccountField {
	name: string;
	value: string;
	verified_at: string | null;
}

export interface Account {
	id: string;
	username: string;
	acct: string;
	display_name: string;
	locked: boolean;
	bot: boolean;
	discoverable?: boolean;
	group?: boolean;
	created_at: string;
	note: string;
	url: string;
	avatar: string;
	avatar_static: string;
	header: string;
	header_static: string;
	followers_count: number;
	following_count: number;
	statuses_count: number;
	last_status_at: string | null;
	emojis: CustomEmoji[];
	fields: AccountField[];
}

/** The viewer's relationship to another account (`/accounts/relationships`). */
export interface Relationship {
	id: string;
	following: boolean;
	showing_reblogs: boolean;
	notifying: boolean;
	followed_by: boolean;
	blocking: boolean;
	blocked_by: boolean;
	muting: boolean;
	muting_notifications: boolean;
	/** A follow request is pending because the target account is locked. */
	requested: boolean;
	requested_by: boolean;
	domain_blocking: boolean;
	endorsed: boolean;
	note: string;
}

export type MediaType = 'unknown' | 'image' | 'gifv' | 'video' | 'audio';

export interface MediaAttachment {
	id: string;
	type: MediaType;
	url: string;
	preview_url: string;
	remote_url?: string | null;
	description: string | null;
	blurhash?: string | null;
}

export interface Mention {
	id: string;
	username: string;
	url: string;
	acct: string;
}

export interface Tag {
	name: string;
	url: string;
}

export interface Card {
	url: string;
	title: string;
	description: string;
	type: string;
	image?: string | null;
	provider_name?: string | null;
}

export type Visibility = 'public' | 'unlisted' | 'private' | 'direct';

export interface PollOption {
	title: string;
	votes_count: number | null;
}

export interface Poll {
	id: string;
	expires_at: string | null;
	expired: boolean;
	multiple: boolean;
	votes_count: number;
	voters_count?: number | null;
	voted?: boolean;
	own_votes?: number[];
	options: PollOption[];
	emojis: CustomEmoji[];
}

export interface Status {
	id: string;
	created_at: string;
	edited_at?: string | null;
	in_reply_to_id: string | null;
	in_reply_to_account_id: string | null;
	sensitive: boolean;
	spoiler_text: string;
	visibility: Visibility;
	language: string | null;
	uri: string;
	url: string | null;
	replies_count: number;
	reblogs_count: number;
	favourites_count: number;
	content: string;
	reblog: Status | null;
	account: Account;
	media_attachments: MediaAttachment[];
	mentions: Mention[];
	tags: Tag[];
	emojis: CustomEmoji[];
	card: Card | null;
	poll: Poll | null;
	favourited?: boolean;
	reblogged?: boolean;
	bookmarked?: boolean;
}

export type NotificationType =
	| 'mention'
	| 'status'
	| 'reblog'
	| 'follow'
	| 'follow_request'
	| 'favourite'
	| 'poll'
	| 'update'
	| 'admin.sign_up'
	| 'admin.report'
	| 'severed_relationships'
	| 'moderation_warning';

export interface Notification {
	id: string;
	type: NotificationType;
	created_at: string;
	account: Account;
	status?: Status;
	emojis?: CustomEmoji[];
}

export interface Context {
	ancestors: Status[];
	descendants: Status[];
}

/**
 * The plain-text source of a status as it was submitted (`/statuses/:id/source`).
 * Needed to edit a post: `Status.content` is rendered HTML.
 */
export interface StatusSource {
	id: string;
	text: string;
	spoiler_text: string;
	content_type?: string;
}

export interface InstanceConfiguration {
	statuses?: { max_characters?: number; max_media_attachments?: number };
	/** Media upload limits, exposed via the v2 instance endpoint. */
	media_attachments?: {
		supported_mime_types?: string[];
		image_size_limit?: number;
		video_size_limit?: number;
		description_limit?: number;
	};
	/** Web Push / VAPID config, exposed via the v2 instance endpoint. */
	vapid?: { public_key?: string };
}

export interface InstanceV2 {
	domain: string;
	title: string;
	description: string;
	configuration?: InstanceConfiguration;
}

/** The limits the composer cares about, resolved from either instance endpoint. */
export interface InstanceLimits {
	maxChars: number;
	maxMediaAttachments: number;
	imageSizeLimit: number;
	videoSizeLimit: number;
	descriptionLimit: number;
	/** Empty when the instance doesn't advertise its accepted types. */
	supportedMediaTypes: string[];
}

export interface InstanceV1 {
	uri: string;
	title: string;
	description: string;
	configuration?: InstanceConfiguration;
}

export interface TokenResponse {
	access_token: string;
	token_type: string;
	scope: string;
	created_at: number;
}

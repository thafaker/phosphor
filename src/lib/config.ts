/**
 * Phosphor is hard-wired to a single GoToSocial instance for now.
 *
 * This file is the *only* place that should know the server URL. When we
 * eventually support picking an instance at login, we replace this constant
 * with per-session state — everything else can stay the same.
 */
export const INSTANCE_URL = 'https://social.janmontag.de';

/** Host without scheme, handy for display ("social.janmontag.de"). */
export const INSTANCE_HOST = INSTANCE_URL.replace(/^https?:\/\//, '');

export const APP_NAME = 'Phosphor';
export const APP_WEBSITE = 'https://github.com/thafaker/phosphor';

/** OAuth scopes requested at login. */
export const SCOPES = 'read write follow push';

/** Path the OAuth provider redirects back to. */
export const REDIRECT_PATH = '/callback';

/** Where the app lands after a successful login. */
export const HOME_PATH = '/';

/** Fallback character limit if the instance doesn't report one. */
export const DEFAULT_MAX_CHARS = 5000;

/** Fallbacks for the media upload limits (used until/unless the instance reports its own). */
export const DEFAULT_MAX_MEDIA_ATTACHMENTS = 4;
export const DEFAULT_MEDIA_SIZE_LIMIT = 10 * 1024 * 1024;
export const DEFAULT_MEDIA_DESCRIPTION_LIMIT = 1500;

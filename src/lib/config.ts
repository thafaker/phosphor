/**
 * Phosphor is a client for any GoToSocial instance. The user picks the
 * instance on the login page (stored in `instance.svelte.ts`).
 *
 * `VITE_INSTANCE_URL` is an optional **build-time default** for operators who
 * host Phosphor for one specific instance: it prefills the login page and is
 * used when no instance has been chosen yet.
 */
export const DEFAULT_INSTANCE_URL = (import.meta.env.VITE_INSTANCE_URL ?? '').trim();

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

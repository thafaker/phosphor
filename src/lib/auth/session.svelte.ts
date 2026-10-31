import { goto } from '$app/navigation';
import { setTokenGetter } from '#lib/api/client.ts';
import { getInstanceLimits, verifyCredentials } from '#lib/api/gotosocial.ts';
import { authorizeUrl, exchangeCode, registerApp, type RegisteredApp } from '#lib/api/oauth.ts';
import type { Account, InstanceLimits } from '#lib/api/types.ts';
import {
	DEFAULT_MAX_CHARS,
	DEFAULT_MAX_MEDIA_ATTACHMENTS,
	DEFAULT_MEDIA_DESCRIPTION_LIMIT,
	DEFAULT_MEDIA_SIZE_LIMIT,
	SCOPES
} from '#lib/config.ts';
import { instance } from '#lib/instance.svelte.ts';
import { normalizeInstanceUrl } from '#lib/utils/instance.ts';
import { clearCachedLists } from '#lib/utils/offline.ts';
import { t } from '#lib/i18n/index.svelte.ts';

const STORAGE_KEY = 'phosphor:session:v1';
const APP_KEY = 'phosphor:oauth-app:v1';
const STATE_KEY = 'phosphor:oauth-state';

interface PersistedSession {
	app: RegisteredApp;
	token: string;
	/** Instance the token belongs to. Missing in sessions from before multi-instance. */
	instance?: string;
	/** Last verified profile and limits, used to boot offline. */
	account?: Account;
	limits?: InstanceLimits;
}

/**
 * A fetch that fails because the network is gone throws a `TypeError`, not an
 * `ApiError`. That distinction matters at startup: an offline launch keeps the
 * persisted session, a rejected token clears it.
 */
function isNetworkFailure(error: unknown): boolean {
	if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
	return error instanceof TypeError;
}

type AppCache = Record<string, RegisteredApp>;

function loadPersisted(): PersistedSession | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as PersistedSession;
		if (parsed?.app?.client_id && parsed?.token) return parsed;
	} catch {
		// ignore corrupt storage
	}
	return null;
}

/**
 * The OAuth app registration is persisted separately from the session: it must
 * survive the redirect to the instance (and back) *before* we have a token.
 * Registrations are cached per instance origin.
 */
function loadApps(): AppCache {
	try {
		const raw = localStorage.getItem(APP_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as AppCache | RegisteredApp;
		// A single-app object predates multi-instance support; re-register once
		// rather than risk sending credentials to the wrong instance.
		if ('client_id' in parsed) return {};
		return parsed;
	} catch {
		// ignore corrupt storage
	}
	return {};
}

function loadApp(origin: string): RegisteredApp | null {
	if (!origin) return null;
	const app = loadApps()[origin];
	return app?.client_id && app?.client_secret ? app : null;
}

function saveApp(origin: string, app: RegisteredApp): void {
	try {
		const apps = loadApps();
		apps[origin] = app;
		localStorage.setItem(APP_KEY, JSON.stringify(apps));
	} catch {
		// ignore (e.g. storage disabled)
	}
}

class Session {
	token = $state<string | null>(null);
	account = $state<Account | null>(null);
	ready = $state(false);
	error = $state<string | null>(null);
	limits = $state<InstanceLimits>({
		maxChars: DEFAULT_MAX_CHARS,
		maxMediaAttachments: DEFAULT_MAX_MEDIA_ATTACHMENTS,
		imageSizeLimit: DEFAULT_MEDIA_SIZE_LIMIT,
		videoSizeLimit: DEFAULT_MEDIA_SIZE_LIMIT,
		descriptionLimit: DEFAULT_MEDIA_DESCRIPTION_LIMIT,
		supportedMediaTypes: []
	});

	app: RegisteredApp | null = null;

	get loggedIn(): boolean {
		return this.token !== null && this.account !== null;
	}

	get maxChars(): number {
		return this.limits.maxChars;
	}

	/** Restore a saved session (if any) and validate it against the instance. */
	async init(): Promise<void> {
		const persisted = loadPersisted();
		if (!persisted) {
			this.ready = true;
			return;
		}

		// Sessions from before multi-instance support do not carry the instance;
		// fall back to the configured/prefilled one.
		const origin = normalizeInstanceUrl(persisted.instance) ?? instance.url;
		if (!origin) {
			this.clear();
			this.ready = true;
			return;
		}
		instance.set(origin);

		this.app = persisted.app;
		this.token = persisted.token;
		setTokenGetter(() => this.token);

		try {
			this.account = await verifyCredentials();
			this.limits = await getInstanceLimits();
			this.persist();
		} catch (err) {
			// The account request succeeded but the limits request failed: keep the
			// session and fall back to the last known limits.
			if (this.account) {
				if (persisted.limits) this.limits = persisted.limits;
				this.persist();
			} else if (isNetworkFailure(err) && persisted.account) {
				// Offline start: keep the last verified profile so the app shell and
				// cached timelines stay usable. Anything else (e.g. a revoked token)
				// still logs out.
				this.account = persisted.account;
				if (persisted.limits) this.limits = persisted.limits;
				this.persist();
			} else {
				this.clear();
			}
		} finally {
			this.ready = true;
		}
	}

	/** Kick off the OAuth dance (registers the app on first use). */
	async beginLogin(): Promise<void> {
		this.error = null;
		if (!instance.url) {
			this.error = t('auth.noInstance');
			return;
		}
		try {
			const origin = instance.url;
			// Re-register if the cached app predates the current scope set
			// (e.g. an app created before we added the `push` scope).
			const cached = loadApp(origin);
			const app = cached && cached.scopes === SCOPES ? cached : await registerApp();
			this.app = app;
			saveApp(origin, app);
			const state = crypto.randomUUID();
			sessionStorage.setItem(STATE_KEY, state);
			window.location.href = authorizeUrl(app, state);
		} catch (err) {
			this.error = err instanceof Error ? err.message : t('auth.loginFailed');
		}
	}

	/** Complete the OAuth dance with the code from the callback URL. */
	async finishLogin(code: string, returnedState: string | null): Promise<void> {
		this.error = null;

		const expectedState = sessionStorage.getItem(STATE_KEY);
		sessionStorage.removeItem(STATE_KEY);
		if (expectedState && returnedState !== expectedState) {
			throw new Error(t('auth.invalidState'));
		}

		const app = this.app ?? loadApp(instance.url) ?? loadPersisted()?.app ?? null;
		if (!app) throw new Error(t('auth.missingApp'));

		const tokenResponse = await exchangeCode(code, app);
		const token = tokenResponse.access_token;
		this.app = app;
		saveApp(instance.url, app);
		this.token = token;
		setTokenGetter(() => this.token);
		this.account = await verifyCredentials();
		this.limits = await getInstanceLimits();
		this.persist();
	}

	logout(): void {
		this.clear();
		void goto('/login');
	}

	/** Store the session plus the last known profile for offline startup. */
	private persist(): void {
		if (!this.app || !this.token) return;
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					app: this.app,
					token: this.token,
					instance: instance.url,
					account: this.account ?? undefined,
					limits: this.limits
				} satisfies PersistedSession)
			);
		} catch {
			// ignore (e.g. storage disabled)
		}
	}

	private clear(): void {
		this.token = null;
		this.account = null;
		this.app = null;
		setTokenGetter(() => null);
		clearCachedLists();
		try {
			localStorage.removeItem(STORAGE_KEY);
			sessionStorage.removeItem(STATE_KEY);
		} catch {
			// ignore
		}
	}
}

export const session = new Session();

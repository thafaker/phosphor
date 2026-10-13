import { goto } from '$app/navigation';
import { setTokenGetter } from '#lib/api/client.ts';
import { getInstanceLimit, verifyCredentials } from '#lib/api/gotosocial.ts';
import { authorizeUrl, exchangeCode, registerApp, type RegisteredApp } from '#lib/api/oauth.ts';
import type { Account } from '#lib/api/types.ts';
import { DEFAULT_MAX_CHARS } from '#lib/config.ts';

const STORAGE_KEY = 'phosphor:session:v1';
const STATE_KEY = 'phosphor:oauth-state';

interface PersistedSession {
	app: RegisteredApp;
	token: string;
}

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

class Session {
	token = $state<string | null>(null);
	account = $state<Account | null>(null);
	ready = $state(false);
	error = $state<string | null>(null);
	maxChars = $state(DEFAULT_MAX_CHARS);

	app: RegisteredApp | null = null;

	get loggedIn(): boolean {
		return this.token !== null && this.account !== null;
	}

	/** Restore a saved session (if any) and validate it against the instance. */
	async init(): Promise<void> {
		const persisted = loadPersisted();
		if (!persisted) {
			this.ready = true;
			return;
		}

		this.app = persisted.app;
		this.token = persisted.token;
		setTokenGetter(() => this.token);

		try {
			this.account = await verifyCredentials();
			this.maxChars = await getInstanceLimit();
		} catch {
			this.clear();
		} finally {
			this.ready = true;
		}
	}

	/** Kick off the OAuth dance (registers the app on first use). */
	async beginLogin(): Promise<void> {
		this.error = null;
		try {
			const app = this.app ?? (await registerApp());
			this.app = app;
			const state = crypto.randomUUID();
			sessionStorage.setItem(STATE_KEY, state);
			window.location.href = authorizeUrl(app, state);
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Login fehlgeschlagen';
		}
	}

	/** Complete the OAuth dance with the code from the callback URL. */
	async finishLogin(code: string, returnedState: string | null): Promise<void> {
		this.error = null;

		const expectedState = sessionStorage.getItem(STATE_KEY);
		sessionStorage.removeItem(STATE_KEY);
		if (expectedState && returnedState !== expectedState) {
			throw new Error('Ungültiger OAuth-State — bitte erneut versuchen.');
		}

		const app = this.app ?? loadPersisted()?.app ?? null;
		if (!app) throw new Error('App-Registrierung fehlt — bitte erneut einloggen.');

		const tokenResponse = await exchangeCode(code, app);
		const token = tokenResponse.access_token;
		this.app = app;
		this.token = token;
		setTokenGetter(() => this.token);
		this.account = await verifyCredentials();
		this.maxChars = await getInstanceLimit();

		localStorage.setItem(STORAGE_KEY, JSON.stringify({ app, token } satisfies PersistedSession));
	}

	logout(): void {
		this.clear();
		void goto('/login');
	}

	private clear(): void {
		this.token = null;
		this.account = null;
		this.app = null;
		setTokenGetter(() => null);
		try {
			localStorage.removeItem(STORAGE_KEY);
			sessionStorage.removeItem(STATE_KEY);
		} catch {
			// ignore
		}
	}
}

export const session = new Session();

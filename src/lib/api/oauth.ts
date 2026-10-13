import { APP_NAME, APP_WEBSITE, INSTANCE_URL, REDIRECT_PATH, SCOPES } from '#lib/config.ts';
import type { TokenResponse } from './types';

export interface RegisteredApp {
	client_id: string;
	client_secret: string;
}

/** The URL GoToSocial sends the user back to after granting access. */
export function redirectUri(): string {
	return window.location.origin + REDIRECT_PATH;
}

/** Register Phosphor as an OAuth app on the instance (once per session). */
export async function registerApp(): Promise<RegisteredApp> {
	const res = await fetch(`${INSTANCE_URL}/api/v1/apps`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_name: APP_NAME,
			redirect_uris: redirectUri(),
			scopes: SCOPES,
			website: APP_WEBSITE
		})
	});
	if (!res.ok) throw new Error(`App-Registrierung fehlgeschlagen (HTTP ${res.status})`);
	const data = (await res.json()) as RegisteredApp;
	return { client_id: data.client_id, client_secret: data.client_secret };
}

/** Build the authorization URL the browser is sent to. */
export function authorizeUrl(app: RegisteredApp, state: string): string {
	const params = new URLSearchParams({
		client_id: app.client_id,
		redirect_uri: redirectUri(),
		response_type: 'code',
		scope: SCOPES,
		state
	});
	return `${INSTANCE_URL}/oauth/authorize?${params.toString()}`;
}

/** Exchange the one-time authorization code for a reusable access token. */
export async function exchangeCode(code: string, app: RegisteredApp): Promise<TokenResponse> {
	const res = await fetch(`${INSTANCE_URL}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			grant_type: 'authorization_code',
			code,
			client_id: app.client_id,
			client_secret: app.client_secret,
			redirect_uri: redirectUri(),
			scope: SCOPES
		})
	});
	if (!res.ok) {
		let message = `Tokenaustausch fehlgeschlagen (HTTP ${res.status})`;
		try {
			const data = (await res.json()) as { error?: string; error_description?: string };
			message = data.error_description ?? data.error ?? message;
		} catch {
			// keep the generic message
		}
		throw new Error(message);
	}
	return (await res.json()) as TokenResponse;
}

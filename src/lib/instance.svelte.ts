import { DEFAULT_INSTANCE_URL } from '#lib/config.ts';
import { instanceHost, normalizeInstanceUrl } from '#lib/utils/instance.ts';

const STORAGE_KEY = 'phosphor:instance:v1';

function load(): string {
	try {
		return normalizeInstanceUrl(localStorage.getItem(STORAGE_KEY)) ?? '';
	} catch {
		return '';
	}
}

/**
 * The GoToSocial instance this browser talks to. Chosen on the login page,
 * persisted locally, and initialised from `VITE_INSTANCE_URL` for deployments
 * that want to prefill (or effectively fix) their own instance.
 *
 * This is deliberately a separate store from the session: it must be known
 * *before* the OAuth redirect and must survive a logout.
 */
class InstanceStore {
	url = $state<string>(load() || normalizeInstanceUrl(DEFAULT_INSTANCE_URL) || '');

	get host(): string {
		return instanceHost(this.url);
	}

	/** Validate and remember a user-entered URL. */
	set(input: string | null | undefined): boolean {
		const normalized = normalizeInstanceUrl(input);
		if (!normalized) return false;
		this.url = normalized;
		try {
			localStorage.setItem(STORAGE_KEY, normalized);
		} catch {
			// ignore (e.g. storage disabled); the choice lasts for this tab only
		}
		return true;
	}
}

export const instance = new InstanceStore();

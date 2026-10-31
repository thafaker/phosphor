/**
 * Small localStorage-backed cache for the last loaded lists.
 *
 * The service worker keeps the app shell available offline; these entries make
 * the first screen useful without a network. Keys live under a single prefix so
 * logout can remove every cached list at once. The account/instance scope is
 * added by the callers, so data from one login never shows up in another.
 */
const PREFIX = 'phosphor:offline:v1:';

export interface CachedList<T> {
	/** When the list was written (Unix ms). */
	at: number;
	items: T[];
}

/** Key for a named list in the given scope (instance origin + account id). */
export function offlineKey(name: string, scope: string): string {
	return `${PREFIX}${name}:${scope}`;
}

export function readCachedList<T>(key: string): CachedList<T> | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<CachedList<T>>;
		if (!Array.isArray(parsed.items) || typeof parsed.at !== 'number') return null;
		return { at: parsed.at, items: parsed.items };
	} catch {
		return null;
	}
}

/**
 * Store at most `limit` items. The first page is all the cache needs: it is
 * what an offline start can show, and it keeps localStorage small.
 */
export function writeCachedList<T>(key: string, items: T[], limit = 20): void {
	try {
		localStorage.setItem(
			key,
			JSON.stringify({ at: Date.now(), items: items.slice(0, limit) } satisfies CachedList<T>)
		);
	} catch {
		// ignore (storage disabled or full)
	}
}

/** Remove every cached list (called on logout / invalid session). */
export function clearCachedLists(): void {
	try {
		const keys: string[] = [];
		for (let index = 0; index < localStorage.length; index += 1) {
			const key = localStorage.key(index);
			if (key?.startsWith(PREFIX)) keys.push(key);
		}
		for (const key of keys) localStorage.removeItem(key);
	} catch {
		// ignore (storage disabled)
	}
}

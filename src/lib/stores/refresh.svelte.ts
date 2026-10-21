/**
 * A one-shot signal for "the user asked for fresh data".
 *
 * Pull-to-refresh sits in the app shell (it is a gesture on the viewport, not
 * on a list), but the data belongs to whichever page is open. So the shell
 * calls `request()` and each view registers a listener in `onMount` to re-read
 * what it owns — a page that knows nothing about the gesture still ends up
 * being refreshed by it.
 *
 * Deliberately not reactive (no `$state`/`$effect`): the listeners are side
 * effects, not derived state, and a plain set avoids the effect re-registering
 * itself on every change.
 */
class RefreshBus {
	#listeners = new Set<() => void>();

	/** Tell every open view to re-read its data. */
	request(): void {
		for (const listener of this.#listeners) {
			try {
				listener();
			} catch {
				// one broken view must not block the others
			}
		}
	}

	/**
	 * Register a refresh handler. Returns the unsubscribe function, so it can be
	 * used directly as an `onMount` teardown:
	 *
	 *     onMount(() => refreshEvent.subscribe(() => void reload()));
	 */
	subscribe(listener: () => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}
}

export const refreshEvent = new RefreshBus();

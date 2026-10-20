import {
	authorizeFollowRequest,
	getFollowRequests,
	rejectFollowRequest
} from '#lib/api/gotosocial.ts';
import type { Account, Relationship } from '#lib/api/types.ts';

/**
 * Pending follow requests for the logged-in account.
 *
 * Maintained lazily: `load()` runs once after login and the stream keeps the
 * list current from there (`follow_request` notifications and `follow`
 * notifications, which GoToSocial sends once a request has been accepted).
 * Nothing here is expensive, so there is no polling.
 */
export class FollowRequestsStore {
	items = $state<Account[]>([]);
	loading = $state(false);
	loaded = $state(false);
	error = $state<string | null>(null);

	/** In-flight accept/reject calls, keyed by account id. */
	busy = $state<Record<string, boolean>>({});

	get pending(): number {
		return this.items.length;
	}

	async load(force = false): Promise<void> {
		if (this.loading || (this.loaded && !force)) return;
		this.loading = true;
		this.error = null;
		try {
			this.items = await getFollowRequests();
			this.loaded = true;
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Anfragen konnten nicht geladen werden.';
		} finally {
			this.loading = false;
		}
	}

	/** A `follow_request` notification arrived over the stream. */
	add(account: Account): void {
		if (this.items.some((item) => item.id === account.id)) return;
		this.items = [account, ...this.items];
	}

	/**
	 * The requester is now a follower (accepted here or approved from another
	 * client): GoToSocial replaces the `follow_request` notification with a
	 * `follow` one, so the request has to leave the list either way.
	 */
	resolve(accountId: string): void {
		this.items = this.items.filter((item) => item.id !== accountId);
	}

	/**
	 * Accept a request. Returns the fresh relationship (GoToSocial answers with
	 * it) and rethrows failures so a caller with its own error slot can show
	 * them; the request stays in the list in that case.
	 */
	async acceptAndReturn(accountId: string): Promise<Relationship> {
		if (this.busy[accountId]) throw new Error('Anfrage läuft bereits.');
		this.busy = { ...this.busy, [accountId]: true };
		this.error = null;
		try {
			const relationship = await authorizeFollowRequest(accountId);
			this.resolve(accountId);
			return relationship;
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Aktion fehlgeschlagen.';
			throw err;
		} finally {
			this.release(accountId);
		}
	}

	/** Accept, swallowing the outcome — for callers that only need the list gone. */
	async accept(accountId: string): Promise<void> {
		try {
			await this.acceptAndReturn(accountId);
		} catch {
			// already recorded in `error`
		}
	}

	async reject(accountId: string): Promise<void> {
		if (this.busy[accountId]) return;
		this.busy = { ...this.busy, [accountId]: true };
		this.error = null;
		try {
			await rejectFollowRequest(accountId);
			this.resolve(accountId);
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Aktion fehlgeschlagen.';
			throw err;
		} finally {
			this.release(accountId);
		}
	}

	private release(accountId: string): void {
		const { [accountId]: _done, ...rest } = this.busy;
		this.busy = rest;
	}

	reset(): void {
		this.items = [];
		this.loaded = false;
		this.error = null;
		this.busy = {};
	}
}

export const followRequests = new FollowRequestsStore();

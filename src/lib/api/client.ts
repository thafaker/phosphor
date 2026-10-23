import { instance } from '#lib/instance.svelte.ts';

export class ApiError extends Error {
	readonly status: number;
	readonly retryAfter: number | null;

	constructor(status: number, message: string, retryAfter: number | null = null) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.retryAfter = retryAfter;
	}
}

let tokenGetter: () => string | null = () => null;

/** The session installs a token getter so every request gets authenticated. */
export function setTokenGetter(fn: () => string | null): void {
	tokenGetter = fn;
}

const MAX_RETRIES = 2;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(res: Response, attempt: number): number {
	const header = res.headers.get('Retry-After');
	const seconds = header ? Number(header) : NaN;
	if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
	return Math.min(1000 * 2 ** attempt, 30_000);
}

export interface RequestOptions {
	method?: string;
	body?: unknown;
	query?: Record<string, string | number | boolean | undefined>;
	signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
	if (!instance.url) throw new ApiError(0, 'Keine Instanz ausgewählt.');
	const url = new URL(path, instance.url);
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined) url.searchParams.set(key, String(value));
		}
	}
	return url.toString();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const method = (options.method ?? 'GET').toUpperCase();
	const idempotent = method === 'GET' || method === 'HEAD';

	// GoToSocial rate-limits (429) and throttles (503) fairly aggressively.
	// We retry idempotent requests with backoff, honouring Retry-After, but
	// never retry writes so we can't accidentally double-post.
	for (let attempt = 0; ; attempt++) {
		const headers = new Headers();
		const token = tokenGetter();
		if (token) headers.set('Authorization', `Bearer ${token}`);

		// Media uploads send a FormData body, which must be handed to fetch
		// untouched so the browser sets the multipart boundary itself.
		let body: BodyInit | undefined;
		if (options.body instanceof FormData) {
			body = options.body;
		} else if (options.body !== undefined) {
			headers.set('Content-Type', 'application/json');
			body = JSON.stringify(options.body);
		}

		const res = await fetch(buildUrl(path, options.query), {
			method,
			headers,
			body,
			signal: options.signal
		});

		if (idempotent && (res.status === 429 || res.status === 503) && attempt < MAX_RETRIES) {
			await sleep(retryDelay(res, attempt));
			continue;
		}

		if (!res.ok) {
			let message = res.statusText || `HTTP ${res.status}`;
			try {
				const data = (await res.json()) as { error?: string };
				if (data?.error) message = data.error;
			} catch {
				// non-JSON error body — keep the status text
			}
			const retryAfterHeader = res.headers.get('Retry-After');
			throw new ApiError(
				res.status,
				message,
				retryAfterHeader !== null ? Number(retryAfterHeader) : null
			);
		}

		if (res.status === 204) return undefined as T;

		const contentType = res.headers.get('Content-Type') ?? '';
		if (!contentType.includes('json')) return (await res.text()) as unknown as T;

		return (await res.json()) as T;
	}
}

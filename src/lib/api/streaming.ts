import { instance } from '#lib/instance.svelte.ts';

export interface StreamEvent {
	stream: string[];
	event: string;
	payload: unknown;
}

type EventHandler = (event: StreamEvent) => void;

const MAX_RECONNECT_DELAY = 30_000;

/**
 * A single GoToSocial user stream.
 *
 * GoToSocial only speaks WebSocket (no SSE), and expects the token as an
 * `access_token` query parameter — this is what Pinafore does too. The
 * connection reconnects automatically with exponential backoff.
 */
export class Stream {
	private ws: WebSocket | null = null;
	private stopped = false;
	private attempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly handlers = new Set<EventHandler>();

	constructor(private readonly token: string) {}

	onEvent(handler: EventHandler): () => void {
		this.handlers.add(handler);
		return () => this.handlers.delete(handler);
	}

	connect(): void {
		this.stopped = false;

		const url = new URL('/api/v1/streaming', instance.url);
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
		url.searchParams.set('access_token', this.token);
		url.searchParams.set('stream', 'user');

		const ws = new WebSocket(url.toString());
		this.ws = ws;

		ws.onopen = () => {
			this.attempt = 0;
		};
		ws.onmessage = (message) => this.handleMessage(message.data);
		ws.onclose = () => {
			this.ws = null;
			if (!this.stopped) this.scheduleReconnect();
		};
		ws.onerror = () => {
			// A close event always follows; reconnection is handled there.
		};
	}

	private handleMessage(raw: unknown): void {
		if (typeof raw !== 'string') return;

		let parsed: { stream?: string[]; event?: string; payload?: unknown };
		try {
			parsed = JSON.parse(raw);
		} catch {
			return;
		}
		if (!parsed?.event) return; // keep-alives and unknown frames

		let { payload } = parsed;
		if (typeof payload === 'string') {
			try {
				payload = JSON.parse(payload);
			} catch {
				// some events (e.g. delete) carry a bare id string
			}
		}

		const event: StreamEvent = { stream: parsed.stream ?? [], event: parsed.event, payload };
		for (const handler of this.handlers) handler(event);
	}

	private scheduleReconnect(): void {
		this.attempt += 1;
		const delay = Math.min(1000 * 2 ** this.attempt, MAX_RECONNECT_DELAY);
		this.reconnectTimer = setTimeout(() => this.connect(), delay);
	}

	/** Whether the socket is currently open and usable. */
	get isOpen(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	/**
	 * Reconnect immediately if the socket is missing or no longer open.
	 *
	 * Mobile browsers freeze background pages: timers stop and the socket dies
	 * without necessarily delivering a close event we can react to in time.
	 * When the app is resumed we therefore drop any pending backoff and open a
	 * fresh connection right away instead of waiting for the next timer tick.
	 *
	 * @returns `true` if a fresh connection was started.
	 */
	ensureConnected(): boolean {
		if (this.stopped) return false;
		const state = this.ws?.readyState;
		if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return false;

		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			// Suppress the close handler so it can't schedule a second reconnect.
			this.ws.onclose = null;
			this.ws.onerror = null;
			try {
				this.ws.close();
			} catch {
				// already closing
			}
			this.ws = null;
		}
		this.attempt = 0;
		this.connect();
		return true;
	}

	close(): void {
		this.stopped = true;
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.ws?.close();
		this.ws = null;
	}
}

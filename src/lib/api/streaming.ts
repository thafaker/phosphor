import { INSTANCE_URL } from '#lib/config.ts';

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

		const url = new URL('/api/v1/streaming', INSTANCE_URL);
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

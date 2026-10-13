import { Stream, type StreamEvent } from '#lib/api/streaming.ts';

type Listener = (event: StreamEvent) => void;

/**
 * Owns the single user WebSocket and fans events out to whoever subscribes.
 * Keeping it central means we never open more than one connection.
 */
class Streamer {
	private stream: Stream | null = null;
	private readonly listeners = new Set<Listener>();

	connect(token: string): void {
		if (this.stream) return;
		const stream = new Stream(token);
		stream.onEvent((event) => this.emit(event));
		stream.connect();
		this.stream = stream;
	}

	disconnect(): void {
		this.stream?.close();
		this.stream = null;
	}

	get connected(): boolean {
		return this.stream !== null;
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private emit(event: StreamEvent): void {
		for (const listener of this.listeners) listener(event);
	}
}

export const streamer = new Streamer();

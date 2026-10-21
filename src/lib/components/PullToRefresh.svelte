<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		/** Runs when the gesture passes the threshold; keeps the indicator up. */
		onRefresh: () => Promise<void>;
	}

	let { onRefresh }: Props = $props();

	/** Only start reacting after this many pixels of a downward drag. */
	const START_AT = 8;
	/** Drag distance that triggers the refresh. */
	const THRESHOLD = 64;
	/** Never let the indicator travel further than this. */
	const MAX = 96;
	/** Movement that outweighs the vertical drag and means "this is a scroll". */
	const SLOP = 1.5;

	let pull = $state(0);
	let dragging = false;
	let busy = $state(false);

	let startY = 0;
	let startX = 0;
	let live = false;

	/** Logarithmic damping: the drag gets heavier the further it goes. */
	function damp(distance: number): number {
		return Math.min(MAX, distance * 0.5);
	}

	function reset(): void {
		dragging = false;
		live = false;
		pull = 0;
	}

	function onTouchStart(event: TouchEvent): void {
		if (busy || event.touches.length !== 1) return;
		// Only a gesture that starts at the very top may become a refresh; a
		// list scrolled down has to keep scrolling normally.
		if (window.scrollY > START_AT) return;

		const touch = event.touches[0];
		startY = touch.clientY;
		startX = touch.clientX;
		live = true;
		dragging = false;
	}

	function onTouchMove(event: TouchEvent): void {
		if (!live || event.touches.length !== 1) return;
		const touch = event.touches[0];
		const dy = touch.clientY - startY;
		const dx = touch.clientX - startX;

		if (!dragging) {
			// Wait until the direction is clear before taking over the gesture.
			if (Math.abs(dy) < START_AT) return;
			if (dy < 0 || Math.abs(dx) > Math.abs(dy) * SLOP) {
				live = false;
				return;
			}
			dragging = true;
		}

		if (dy <= 0 || window.scrollY > 0) {
			reset();
			return;
		}

		// Taking over means suppressing the browser's own rubber-banding and its
		// pull-to-refresh, which would otherwise reload the whole app.
		if (event.cancelable) event.preventDefault();
		pull = damp(dy);
	}

	async function onTouchEnd(): Promise<void> {
		if (!live) return;
		const triggered = dragging && pull >= THRESHOLD;
		live = false;
		dragging = false;

		if (!triggered) {
			pull = 0;
			return;
		}

		busy = true;
		pull = THRESHOLD;
		try {
			await onRefresh();
		} finally {
			// Brief pause so the result is visible instead of the arrow just
			// snapping away.
			setTimeout(() => {
				busy = false;
				pull = 0;
			}, 400);
		}
	}

	const ready = $derived(pull >= THRESHOLD);
	const label = $derived(
		busy
			? 'Wird aktualisiert …'
			: ready
				? 'Loslassen zum Aktualisieren'
				: 'Zum Aktualisieren ziehen'
	);
</script>

<div
	class="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center"
	style="padding-top: env(safe-area-inset-top)"
>
	<div
		class="mt-2 flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-soft shadow-glow transition-opacity {pull >
		0
			? 'opacity-100'
			: 'opacity-0'}"
		style="transform: translateY({pull}px)"
		data-no-open
	>
		<Icon name="refresh" size={15} class={busy ? 'animate-spin text-accent' : 'text-accent'} />
		<span class="hidden sm:inline">{label}</span>
	</div>
</div>

<svelte:window
	ontouchstart={onTouchStart}
	ontouchmove={onTouchMove}
	ontouchend={onTouchEnd}
	ontouchcancel={reset}
/>

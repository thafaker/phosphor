<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		count: number;
		/** Accusative singular/plural after the number, e.g. "neuer Beitrag". */
		singular: string;
		plural: string;
		onclick: () => void;
		/** Keeps the pill below the page's sticky header. */
		offsetClass?: string;
	}

	let { count, singular, plural, onclick, offsetClass = 'top-16' }: Props = $props();
</script>

{#if count > 0}
	<div
		class="pointer-events-none sticky z-20 h-0 {offsetClass}"
		aria-live="polite"
		aria-atomic="true"
	>
		<div class="flex justify-center">
			<button
				type="button"
				class="pointer-events-auto mt-2 flex items-center gap-1.5 rounded-full border border-accent/40 bg-surface/95 px-3.5 py-1.5 text-sm font-medium text-accent shadow-glow backdrop-blur transition hover:bg-accent/10"
				{onclick}
			>
				<Icon name="chevron-up" size={14} />
				<span>{count} {count === 1 ? singular : plural}</span>
			</button>
		</div>
	</div>
{/if}

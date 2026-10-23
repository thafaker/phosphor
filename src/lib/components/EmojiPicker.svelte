<script lang="ts">
	import { customEmoji } from '#lib/stores/emojis.svelte.ts';
	import Icon from './Icon.svelte';

	interface Props {
		/** Receives the bare shortcode, without the surrounding colons. */
		onPick: (shortcode: string) => void;
		disabled?: boolean;
	}

	let { onPick, disabled = false }: Props = $props();

	let open = $state(false);
	let query = $state('');
	let root = $state<HTMLDivElement | null>(null);

	const matches = $derived.by(() => {
		const term = query.trim().toLowerCase();
		if (!term) return customEmoji.items;
		return customEmoji.items.filter((emoji) => emoji.shortcode.toLowerCase().includes(term));
	});

	function toggle(): void {
		open = !open;
		if (open) void customEmoji.load();
	}

	function pick(shortcode: string): void {
		onPick(shortcode);
		open = false;
		query = '';
	}

	// Close on outside click and Escape, like any dropdown.
	$effect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (root && !root.contains(event.target as Node)) open = false;
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') open = false;
		};
		window.addEventListener('pointerdown', onPointerDown);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('pointerdown', onPointerDown);
			window.removeEventListener('keydown', onKeyDown);
		};
	});
</script>

<div class="relative" bind:this={root}>
	<button
		type="button"
		{disabled}
		class="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-accent/10 disabled:opacity-40"
		title="Custom-Emoji einfügen"
		aria-label="Custom-Emoji einfügen"
		aria-haspopup="dialog"
		aria-expanded={open}
		onclick={toggle}
	>
		<Icon name="smile" size={15} />
	</button>

	{#if open}
		<div
			class="absolute top-full left-0 z-30 mt-1 w-72 rounded-lg border border-line bg-surface p-2 shadow-glow"
			role="dialog"
			aria-label="Custom-Emojis"
		>
			<input
				type="search"
				bind:value={query}
				placeholder="Emoji suchen…"
				class="w-full rounded-md border border-line bg-inset px-2 py-1 text-xs text-ink-strong placeholder-ink-faint outline-none focus:border-accent/60"
			/>

			{#if customEmoji.loading && !customEmoji.items.length}
				<div class="flex justify-center py-6 text-ink-soft">
					<Icon name="refresh" size={18} class="animate-spin" />
				</div>
			{:else if customEmoji.error}
				<p class="px-1 py-4 text-xs text-danger">{customEmoji.error}</p>
			{:else if !matches.length}
				<p class="px-1 py-4 text-xs text-ink-faint">
					{customEmoji.items.length
						? 'Kein Emoji gefunden.'
						: 'Diese Instanz hat keine Custom-Emojis.'}
				</p>
			{:else}
				<div class="mt-2 grid max-h-56 grid-cols-7 gap-1 overflow-y-auto">
					{#each matches as emoji (emoji.shortcode)}
						<button
							type="button"
							class="flex items-center justify-center rounded-md p-1 hover:bg-accent/10"
							title={`:${emoji.shortcode}:`}
							aria-label={`:${emoji.shortcode}:`}
							onclick={() => pick(emoji.shortcode)}
						>
							<img
								src={emoji.static_url || emoji.url}
								alt={emoji.shortcode}
								loading="lazy"
								class="h-7 w-7 object-contain"
							/>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

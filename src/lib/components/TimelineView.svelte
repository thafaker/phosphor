<script lang="ts">
	import type { TimelineFeed } from '#lib/stores/feed.svelte.ts';
	import Icon from './Icon.svelte';
	import StatusCard from './StatusCard.svelte';

	interface Props {
		feed: TimelineFeed;
		emptyText?: string;
	}

	let { feed, emptyText = 'Hier ist noch nichts.' }: Props = $props();

	let sentinel: HTMLDivElement | undefined = $state();

	// Kick off the first page once, when the view mounts.
	$effect(() => {
		void feed.load();
	});

	// Infinite scroll: fetch older posts as the sentinel comes into view.
	$effect(() => {
		const element = sentinel;
		if (!element) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void feed.loadMore();
			},
			{ rootMargin: '800px' }
		);
		observer.observe(element);
		return () => observer.disconnect();
	});
</script>

{#if feed.error}
	<div
		class="m-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
	>
		<Icon name="alert" size={18} />
		<span class="flex-1">{feed.error}</span>
		<button
			type="button"
			class="rounded-md border border-danger/40 px-2 py-1 text-xs hover:bg-danger/10"
			onclick={() => feed.load(true)}
		>
			Erneut versuchen
		</button>
	</div>
{/if}

{#if feed.loading && !feed.items.length}
	{#each Array(5) as _, index (index)}
		<div class="flex animate-pulse gap-3 border-b border-line px-4 py-4">
			<div class="h-11 w-11 shrink-0 rounded-full bg-accent/10"></div>
			<div class="flex-1 space-y-2">
				<div class="h-3 w-40 rounded bg-accent/10"></div>
				<div class="h-3 w-full rounded bg-accent/10"></div>
				<div class="h-3 w-2/3 rounded bg-accent/10"></div>
			</div>
		</div>
	{/each}
{:else if !feed.items.length && feed.loaded}
	<div class="px-6 py-16 text-center text-ink-faint">
		<Icon name="sparkles" size={28} class="mx-auto mb-3 text-ink-soft" />
		<p>{emptyText}</p>
		<p class="mt-1 text-sm">
			Folge ein paar Leuten — GoToSocial zeigt dir nur neue Beiträge, keine alten.
		</p>
	</div>
{:else}
	{#each feed.items as status (status.id)}
		<StatusCard {status} />
	{/each}
{/if}

<div bind:this={sentinel} class="h-px"></div>

{#if feed.loading && feed.items.length}
	<div class="flex justify-center py-4 text-ink-soft">
		<Icon name="refresh" size={20} class="animate-spin" />
	</div>
{/if}

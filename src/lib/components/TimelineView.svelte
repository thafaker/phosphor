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
		class="m-4 flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200"
	>
		<Icon name="alert" size={18} />
		<span class="flex-1">{feed.error}</span>
		<button
			type="button"
			class="rounded-md border border-red-300/40 px-2 py-1 text-xs hover:bg-red-400/10"
			onclick={() => feed.load(true)}
		>
			Erneut versuchen
		</button>
	</div>
{/if}

{#if feed.loading && !feed.items.length}
	{#each Array(5) as _, index (index)}
		<div class="flex animate-pulse gap-3 border-b border-emerald-400/10 px-4 py-4">
			<div class="h-11 w-11 shrink-0 rounded-full bg-emerald-400/10"></div>
			<div class="flex-1 space-y-2">
				<div class="h-3 w-40 rounded bg-emerald-400/10"></div>
				<div class="h-3 w-full rounded bg-emerald-400/10"></div>
				<div class="h-3 w-2/3 rounded bg-emerald-400/10"></div>
			</div>
		</div>
	{/each}
{:else if !feed.items.length && feed.loaded}
	<div class="px-6 py-16 text-center text-emerald-300/50">
		<Icon name="sparkles" size={28} class="mx-auto mb-3 text-emerald-400/60" />
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
	<div class="flex justify-center py-4 text-emerald-400/60">
		<Icon name="refresh" size={20} class="animate-spin" />
	</div>
{/if}

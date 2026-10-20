<script lang="ts">
	import type { Status } from '#lib/api/types.ts';
	import type { TimelineFeed } from '#lib/stores/feed.svelte.ts';
	import Icon from './Icon.svelte';
	import ReplyBox from './ReplyBox.svelte';
	import StatusCard from './StatusCard.svelte';

	interface Props {
		feed: TimelineFeed;
		emptyText?: string;
		/** Second, smaller line under the empty state; pass '' to hide it. */
		emptyHint?: string;
		/** Forwarded to each card so a host view can drop a deleted post. */
		onDeleted?: (id: string) => void;
	}

	let {
		feed,
		emptyText = 'Hier ist noch nichts.',
		emptyHint = 'Folge ein paar Leuten — GoToSocial zeigt dir nur neue Beiträge, keine alten.',
		onDeleted
	}: Props = $props();

	let sentinel: HTMLDivElement | undefined = $state();

	/**
	 * The post whose reply box is open. Tracked by id: the feed hands out fresh
	 * objects on every refresh, and replying to a stale copy would count the
	 * reply against the wrong list.
	 */
	let replyingTo = $state<string | null>(null);

	/** A reply lands in the thread, not in this timeline — only the counter moves. */
	function onReplyPosted(parent: Status): void {
		parent.replies_count += 1;
	}

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
			<div
				class="shrink-0 rounded-full bg-accent/10"
				style="width: calc(44px * var(--ui-scale)); height: calc(44px * var(--ui-scale))"
			></div>
			<div class="flex-1 space-y-2">
				<div class="w-40 rounded bg-accent/10" style="height: calc(12px * var(--ui-scale))"></div>
				<div class="w-full rounded bg-accent/10" style="height: calc(12px * var(--ui-scale))"></div>
				<div class="w-2/3 rounded bg-accent/10" style="height: calc(12px * var(--ui-scale))"></div>
			</div>
		</div>
	{/each}
{:else if !feed.items.length && feed.loaded}
	<div class="px-6 py-16 text-center text-ink-faint">
		<Icon name="sparkles" size={28} class="mx-auto mb-3 text-ink-soft" />
		<p>{emptyText}</p>
		{#if emptyHint}
			<p class="mt-1 text-sm">{emptyHint}</p>
		{/if}
	</div>
{:else}
	{#each feed.items as status (status.id)}
		<StatusCard
			{status}
			{onDeleted}
			onReply={() => (replyingTo = replyingTo === status.id ? null : status.id)}
		/>
		{#if replyingTo === status.id}
			<ReplyBox
				status={status.reblog ?? status}
				onClose={() => (replyingTo = null)}
				onPosted={onReplyPosted}
			/>
		{/if}
	{/each}
{/if}

<div bind:this={sentinel} class="h-px"></div>

{#if feed.loading && feed.items.length}
	<div class="flex justify-center py-4 text-ink-soft">
		<Icon name="refresh" size={20} class="animate-spin" />
	</div>
{/if}

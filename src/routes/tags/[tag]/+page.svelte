<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Icon from '#lib/components/Icon.svelte';
	import TimelineView from '#lib/components/TimelineView.svelte';
	import { followHashtag, getHashtag, tagTimeline, unfollowHashtag } from '#lib/api/gotosocial.ts';
	import type { Tag } from '#lib/api/types.ts';
	import { TimelineFeed } from '#lib/stores/feed.svelte.ts';

	const tagName = $derived(page.params.tag ?? '');

	let tag = $state<Tag | null>(null);
	let loading = $state(true);
	let followBusy = $state(false);

	const feed = $derived(
		new TimelineFeed((params) =>
			tagTimeline(tagName, {
				limit: params.limit ?? 20,
				maxId: params.maxId
			})
		)
	);

	async function load() {
		loading = true;
		try {
			tag = await getHashtag(tagName);
		} catch (e) {
			console.error(e);
		} finally {
			loading = false;
		}
	}

	async function toggleFollow() {
		if (!tag) return;
		followBusy = true;
		try {
			if (tag.following) {
				tag = await unfollowHashtag(tagName);
			} else {
				tag = await followHashtag(tagName);
			}
		} catch (e) {
			console.error(e);
		} finally {
			followBusy = false;
		}
	}

	onMount(() => {
		void load();
	});
</script>

<header
	class="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur"
>
	<div class="flex items-center gap-2">
		<Icon name="hashtag" size={18} class="text-accent" />
		<h1 class="text-lg font-semibold tracking-tight text-ink-strong">#{tagName}</h1>
	</div>
	{#if tag}
		<button
			class="rounded-lg px-3 py-1.5 text-sm {tag.following
				? 'border border-line bg-surface text-ink'
				: 'bg-accent/10 text-accent hover:bg-accent/20'}"
			onclick={toggleFollow}
			disabled={followBusy}
		>
			{tag.following ? 'Entfolgen' : 'Folgen'}
		</button>
	{/if}
</header>

{#if loading}
	<div class="p-4 text-ink-soft">Lade...</div>
{:else}
	<TimelineView {feed} emptyText="Noch keine Beiträge zu diesem Hashtag." />
{/if}

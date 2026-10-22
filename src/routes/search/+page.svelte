<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import TimelineView from '#lib/components/TimelineView.svelte';
	import { search } from '#lib/api/gotosocial.ts';
	import type { Account, Tag } from '#lib/api/types.ts';
	import { TimelineFeed } from '#lib/stores/feed.svelte.ts';
	import { emojify } from '#lib/utils/text.ts';

	type Tab = 'all' | 'accounts' | 'hashtags' | 'statuses';
	let query = $state(page.url.searchParams.get('q')?.trim() ?? '');
	let tab = $state<Tab>((page.url.searchParams.get('tab') as Tab) || 'all');

	let accounts = $state<Account[]>([]);
	let hashtags = $state<Tag[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let searched = $state(false);

	// Debounce search
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const q = query.trim();
		if (timer) clearTimeout(timer);
		if (q.length < 2) {
			accounts = [];
			hashtags = [];
			searched = false;
			error = null;
			return;
		}
		loading = true;
		error = null;
		timer = setTimeout(async () => {
			try {
				const res = await search({ q, limit: 20 });
				accounts = res.accounts;
				hashtags = res.hashtags;
				searched = true;
			} catch (err) {
				error = err instanceof Error ? err.message : 'Suche fehlgeschlagen';
			} finally {
				loading = false;
			}
		}, 300);
		return () => clearTimeout(timer);
	});

	// Status feed for 'statuses' tab
	const statusFeed = $derived(
		new TimelineFeed((params) => {
			const q = query.trim();
			if (!q) return Promise.resolve([]);
			return search({ q, type: 'statuses', limit: params.limit ?? 20 }).then((r) => r.statuses);
		})
	);

	function openAccount(id: string) {
		goto(`/accounts/${id}`);
	}

	function openHashtag(name: string) {
		goto(`/tags/${encodeURIComponent(name.replace(/^#/, ''))}`);
	}

	function submit(e: Event) {
		e.preventDefault();
		if (!query.trim()) return;
		const url = new URL(location.href);
		url.searchParams.set('q', query.trim());
		url.searchParams.set('tab', tab);
		history.replaceState({}, '', url.toString());
	}
</script>

<header class="sticky top-0 z-20 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur">
	<h1 class="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink-strong">
		<Icon name="search" size={18} class="text-accent" />
		Suche
	</h1>
</header>

<div class="border-b border-line px-4 py-3">
	<form onsubmit={submit} class="flex gap-2">
		<input
			class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink-strong placeholder:text-ink-faint focus:border-accent/40 focus:outline-none"
			type="search"
			placeholder="Suche nach Personen, Hashtags oder Beiträgen..."
			bind:value={query}
		/>
		<button class="rounded-lg bg-accent/10 px-3 py-2 text-accent hover:bg-accent/20" type="submit">
			<Icon name="search" size={18} />
		</button>
	</form>

	<div class="mt-2 flex gap-2 text-sm">
		<button
			class="rounded px-2 py-1 {tab === 'all' ? 'bg-accent/10 text-accent' : 'text-ink-soft'}"
			onclick={() => (tab = 'all')}
		>
			Alle
		</button>
		<button
			class="rounded px-2 py-1 {tab === 'accounts' ? 'bg-accent/10 text-accent' : 'text-ink-soft'}"
			onclick={() => (tab = 'accounts')}
		>
			Personen
		</button>
		<button
			class="rounded px-2 py-1 {tab === 'hashtags' ? 'bg-accent/10 text-accent' : 'text-ink-soft'}"
			onclick={() => (tab = 'hashtags')}
		>
			Hashtags
		</button>
		<button
			class="rounded px-2 py-1 {tab === 'statuses' ? 'bg-accent/10 text-accent' : 'text-ink-soft'}"
			onclick={() => (tab = 'statuses')}
		>
			Beiträge
		</button>
	</div>
</div>

{#if error}
	<div class="m-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
		{error}
	</div>
{/if}

{#if loading}
	<div class="p-4 text-ink-soft">Suche...</div>
{/if}

{#if !loading && searched && query.trim().length >= 2}
	{#if tab === 'all' || tab === 'accounts'}
		{#if accounts.length > 0}
			<div class="px-4 pt-3 pb-2 text-sm font-semibold text-ink-strong">Personen</div>
			{#each accounts as acc (acc.id)}
				<button
					class="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left hover:bg-surface/50"
					onclick={() => openAccount(acc.id)}
				>
					<Avatar src={acc.avatar_static} alt={acc.username} size={40} />
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<div class="truncate font-medium text-ink-strong">
								{@html emojify(acc.display_name || acc.username, acc.emojis)}
							</div>
						</div>
						<div class="truncate text-sm text-ink-faint">@{acc.acct}</div>
					</div>
				</button>
			{/each}
		{/if}
	{/if}

	{#if tab === 'all' || tab === 'hashtags'}
		{#if hashtags.length > 0}
			<div class="px-4 pt-3 pb-2 text-sm font-semibold text-ink-strong">Hashtags</div>
			{#each hashtags as tag (tag.name)}
				<button
					class="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left hover:bg-surface/50"
					onclick={() => openHashtag(tag.name)}
				>
					<div
						class="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent"
					>
						<Icon name="hashtag" size={18} />
					</div>
					<div class="min-w-0 flex-1">
						<div class="font-medium text-ink-strong">#{tag.name}</div>
						{#if tag.history}
							<div class="text-xs text-ink-faint">
								{tag.history.reduce((sum, h) => sum + parseInt(h.uses || '0'), 0)} Beiträge
							</div>
						{/if}
					</div>
				</button>
			{/each}
		{/if}
	{/if}

	{#if tab === 'statuses'}
		<TimelineView feed={statusFeed} emptyText="Keine Beiträge gefunden." />
	{/if}

	{#if tab === 'all' && accounts.length === 0 && hashtags.length === 0}
		<div class="p-4 text-ink-soft">Keine Ergebnisse gefunden.</div>
	{/if}
{/if}

{#if query.trim().length < 2 && !searched}
	<div class="p-4 text-ink-soft">Gib mindestens 2 Zeichen ein.</div>
{/if}

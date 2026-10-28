<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import NewItemsPill from '#lib/components/NewItemsPill.svelte';
	import StatusCard from '#lib/components/StatusCard.svelte';
	import type { Notification, NotificationType } from '#lib/api/types.ts';
	import { notificationsFeed } from '#lib/stores/notifications.svelte.ts';
	import { emojify } from '#lib/utils/text.ts';
	import { relativeTime } from '#lib/utils/time.ts';

	type Filter = 'all' | 'mentions' | 'favourites' | 'boosts' | 'follows' | 'other';

	const buckets: { value: Filter; label: string; types: NotificationType[] }[] = [
		{ value: 'mentions', label: 'Erwähnungen', types: ['mention'] },
		{ value: 'favourites', label: 'Favoriten', types: ['favourite'] },
		{ value: 'boosts', label: 'Boosts', types: ['reblog'] },
		{ value: 'follows', label: 'Folgt', types: ['follow', 'follow_request'] }
	];

	const known = new Set(buckets.flatMap((bucket) => bucket.types));

	/**
	 * Filtering happens client-side: GoToSocial expects `types[]` / `exclude_types[]`
	 * query arrays, and a single feed keeps the stream, pagination, and read state
	 * consistent across tabs. "Sonstiges" is whatever does not fit the other
	 * buckets, so new notification types cannot silently disappear.
	 */
	const filters: { value: Filter; label: string; match: (item: Notification) => boolean }[] = [
		{ value: 'all', label: 'Alle', match: () => true },
		...buckets.map((bucket) => ({
			...bucket,
			match: (item: Notification) => bucket.types.includes(item.type)
		})),
		{ value: 'other', label: 'Sonstiges', match: (item: Notification) => !known.has(item.type) }
	];

	const meta: Record<string, { icon: string; label: string }> = {
		mention: { icon: 'at', label: 'hat dich erwähnt' },
		reblog: { icon: 'boost', label: 'hat deinen Beitrag geboostet' },
		favourite: { icon: 'star', label: 'hat deinen Beitrag favorisiert' },
		follow: { icon: 'user', label: 'folgt dir jetzt' },
		follow_request: { icon: 'user', label: 'möchte dir folgen' },
		poll: { icon: 'info', label: 'Eine Umfrage ist beendet' },
		update: { icon: 'sparkles', label: 'hat einen Beitrag bearbeitet' }
	};

	function describe(type: NotificationType) {
		return meta[type] ?? { icon: 'bell', label: 'Neue Aktivität' };
	}

	let filter = $state<Filter>('all');
	let sentinel: HTMLDivElement | undefined = $state();

	const current = $derived(filters.find((entry) => entry.value === filter) ?? filters[0]);
	const visible = $derived(notificationsFeed.items.filter((item) => current.match(item)));
	/** Pending items count for the badges/tabs, but are not rendered until applied. */
	const knownItems = $derived([...notificationsFeed.pending, ...notificationsFeed.items]);

	const unreadTotal = $derived(notificationsFeed.unread);

	function countFor(entry: (typeof filters)[number]): number {
		return knownItems.filter((item) => entry.match(item) && !notificationsFeed.isRead(item)).length;
	}

	/** A few pixels of tolerance for fractional scroll positions. */
	const TOP_THRESHOLD = 4;

	function atTop(): boolean {
		return window.scrollY < TOP_THRESHOLD;
	}

	/** Buffered stream notifications stay hidden while reading further down. */
	function applyPendingIfAtTop(): void {
		if (notificationsFeed.pending.length && atTop()) notificationsFeed.applyPending();
	}

	function handleScroll(): void {
		applyPendingIfAtTop();
	}

	/** Show the buffered notifications: jump to the top first, then insert. */
	function showPending(): void {
		window.scrollTo({ top: 0, behavior: 'auto' });
		notificationsFeed.applyPending();
	}

	$effect(() => {
		applyPendingIfAtTop();
	});

	function markRead(notification: Notification) {
		notificationsFeed.markRead(notification);
	}

	$effect(() => {
		void notificationsFeed.load();
	});

	$effect(() => {
		const element = sentinel;
		if (!element) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void notificationsFeed.loadMore();
			},
			{ rootMargin: '800px' }
		);
		observer.observe(element);
		return () => observer.disconnect();
	});
</script>

<header class="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
	<div class="flex items-center gap-3 px-4 py-3">
		<h1 class="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink-strong">
			<Icon name="bell" size={18} class="text-accent" />
			Meldungen
		</h1>
		{#if unreadTotal > 0}
			<button
				type="button"
				class="ml-auto flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft transition hover:bg-accent/10 hover:text-ink-strong"
				onclick={() => notificationsFeed.markAllRead()}
			>
				<Icon name="check" size={13} />
				Alle gelesen
			</button>
		{/if}
	</div>

	<div
		class="flex gap-2 overflow-x-auto px-4 pb-3 text-sm"
		role="tablist"
		aria-label="Meldungen filtern"
	>
		{#each filters as entry (entry.value)}
			{@const unread = countFor(entry)}
			<button
				type="button"
				role="tab"
				aria-selected={filter === entry.value}
				class="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 transition {filter ===
				entry.value
					? 'border-accent/40 bg-accent/10 text-accent'
					: 'border-line text-ink-soft hover:bg-accent/5 hover:text-ink-strong'}"
				onclick={() => (filter = entry.value)}
			>
				{entry.label}
				{#if unread > 0}
					<span
						class="rounded-full bg-accent px-1.5 text-[calc(10px*var(--text-scale))] leading-4 font-bold text-accent-ink"
					>
						{unread > 99 ? '99+' : unread}
					</span>
				{/if}
			</button>
		{/each}
	</div>
</header>

<svelte:window onscroll={handleScroll} />

<NewItemsPill
	count={notificationsFeed.pending.length}
	singular="neue Meldung"
	plural="neue Meldungen"
	onclick={showPending}
	offsetClass="top-24"
/>

{#if notificationsFeed.error}
	<div class="m-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
		{notificationsFeed.error}
	</div>
{/if}

{#if notificationsFeed.loading && !notificationsFeed.items.length}
	<div class="flex justify-center py-10 text-ink-soft">
		<Icon name="refresh" size={22} class="animate-spin" />
	</div>
{:else if !visible.length && notificationsFeed.loaded}
	<div class="px-6 py-16 text-center text-ink-faint">
		<Icon
			name={filter === 'all' ? 'bell' : 'search'}
			size={28}
			class="mx-auto mb-3 text-ink-soft"
		/>
		<p>
			{filter === 'all' ? 'Noch keine Meldungen.' : `Keine Meldungen in „${current.label}“.`}
		</p>
	</div>
{:else}
	<ul>
		{#each visible as notification (notification.id)}
			{@const info = describe(notification.type)}
			{@const name = notification.account.display_name || notification.account.username}
			{@const unread = !notificationsFeed.isRead(notification)}
			<li class="border-b border-line {unread ? 'bg-accent/5' : ''}">
				<div class="flex items-center gap-3 px-4 pt-3">
					{#if unread}
						<span class="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Ungelesen"></span>
					{:else}
						<span class="h-2 w-2 shrink-0"></span>
					{/if}
					<Icon name={info.icon} size={18} class="text-accent" />
					<div class="min-w-0 flex-1 text-sm text-ink-soft">
						<a
							href={`/accounts/${notification.account.id}`}
							class="font-semibold text-ink-strong hover:underline"
						>
							{@html emojify(name, notification.account.emojis)}
						</a>
						{info.label}
					</div>
					<a href={`/accounts/${notification.account.id}`} title={`@${notification.account.acct}`}>
						<Avatar src={notification.account.avatar_static} alt={name} size={32} />
					</a>
					<span class="text-xs text-ink-faint">
						{relativeTime(notification.created_at)}
					</span>
					{#if unread}
						<button
							type="button"
							class="rounded-md p-1 text-ink-faint transition hover:bg-accent/10 hover:text-accent"
							title="Als gelesen markieren"
							aria-label="Als gelesen markieren"
							onclick={() => markRead(notification)}
						>
							<Icon name="check" size={15} />
						</button>
					{/if}
				</div>
				{#if notification.status}
					<div class="pr-1 pl-10">
						<StatusCard status={notification.status} />
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<div bind:this={sentinel} class="h-px"></div>

{#if notificationsFeed.loading && notificationsFeed.items.length}
	<div class="flex justify-center py-4 text-ink-soft">
		<Icon name="refresh" size={20} class="animate-spin" />
	</div>
{/if}

<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import StatusCard from '#lib/components/StatusCard.svelte';
	import type { NotificationType } from '#lib/api/types.ts';
	import { notificationsFeed } from '#lib/stores/notifications.svelte.ts';
	import { emojify } from '#lib/utils/text.ts';
	import { relativeTime } from '#lib/utils/time.ts';

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

	let sentinel: HTMLDivElement | undefined = $state();

	$effect(() => {
		void notificationsFeed.load();
	});

	// Clear the unread dot while this page is open, including notifications
	// that arrive over the stream while we are already looking at them.
	$effect(() => {
		if (notificationsFeed.items.length) notificationsFeed.markAllRead();
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

<header class="sticky top-0 z-20 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur">
	<h1 class="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink-strong">
		<Icon name="bell" size={18} class="text-accent" />
		Meldungen
	</h1>
</header>

{#if notificationsFeed.error}
	<div class="m-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
		{notificationsFeed.error}
	</div>
{/if}

{#if notificationsFeed.loading && !notificationsFeed.items.length}
	<div class="flex justify-center py-10 text-ink-soft">
		<Icon name="refresh" size={22} class="animate-spin" />
	</div>
{:else if !notificationsFeed.items.length && notificationsFeed.loaded}
	<div class="px-6 py-16 text-center text-ink-faint">
		<Icon name="bell" size={28} class="mx-auto mb-3 text-ink-soft" />
		<p>Noch keine Meldungen.</p>
	</div>
{:else}
	<ul>
		{#each notificationsFeed.items as notification (notification.id)}
			{@const info = describe(notification.type)}
			{@const name = notification.account.display_name || notification.account.username}
			<li class="border-b border-line">
				<div class="flex items-center gap-3 px-4 pt-3">
					<Icon name={info.icon} size={18} class="text-accent" />
					<div class="min-w-0 flex-1 text-sm text-ink-soft">
						<a
							href={notification.account.url}
							target="_blank"
							rel="noopener noreferrer"
							class="font-semibold text-ink-strong hover:underline"
						>
							{@html emojify(name, notification.account.emojis)}
						</a>
						{info.label}
					</div>
					<Avatar src={notification.account.avatar_static} alt={name} size={32} />
					<span class="text-xs text-ink-faint">
						{relativeTime(notification.created_at)}
					</span>
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

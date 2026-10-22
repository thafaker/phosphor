<script lang="ts">
	import { page } from '$app/state';
	import { session } from '#lib/auth/session.svelte.ts';
	import { followRequests } from '#lib/stores/followRequests.svelte.ts';
	import { notificationsFeed } from '#lib/stores/notifications.svelte.ts';
	import { emojify } from '#lib/utils/text.ts';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';

	const items = $derived([
		{ href: '/', label: 'Start', icon: 'home' },
		{ href: '/search', label: 'Suche', icon: 'search' },
		{ href: '/notifications', label: 'Meldungen', icon: 'bell' },
		// Only worth a slot while the profile is private (only then can requests
		// exist at all) or while some are actually waiting.
		...(followRequests.pending > 0 || session.account?.locked
			? [{ href: '/follow_requests', label: 'Anfragen', icon: 'user-plus' }]
			: []),
		{ href: '/local', label: 'Lokal', icon: 'globe' },
		...(session.account
			? [{ href: `/accounts/${session.account.id}`, label: 'Profil', icon: 'user' }]
			: []),
		{ href: '/settings', label: 'Einstellungen', icon: 'settings' }
	]);

	function isActive(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}

	/** Pending follow requests, shown as a badge on the "Anfragen" entry. */
	function badge(href: string): number {
		if (href === '/follow_requests') return followRequests.pending;
		return 0;
	}

	const accountName = $derived(
		session.account
			? emojify(session.account.display_name || session.account.username, session.account.emojis)
			: ''
	);
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-line bg-canvas/95 px-2 py-1.5 backdrop-blur md:sticky md:top-0 md:h-dvh md:w-60 md:flex-col md:items-stretch md:justify-start md:gap-1 md:border-t-0 md:border-r md:bg-transparent md:px-4 md:py-6"
>
	<a href="/" class="hidden items-center gap-2 px-2 py-3 md:flex" aria-label="Phosphor">
		<Icon name="sparkles" size={22} class="text-accent" />
		<span class="text-lg font-bold tracking-tight text-accent">phosphor</span>
	</a>

	{#each items as item (item.href)}
		<a
			href={item.href}
			class="relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-ink-soft transition hover:bg-accent/10 hover:text-ink-strong md:flex-none md:flex-row md:gap-3 md:px-3 md:py-2.5 md:text-base"
			class:text-accent={isActive(item.href)}
		>
			<span class="relative">
				<Icon name={item.icon} size={22} />
				{#if item.href === '/notifications' && notificationsFeed.unread > 0}
					<span
						class="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-canvas"
					></span>
				{:else if badge(item.href)}
					<span
						class="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-bold text-accent-ink ring-2 ring-canvas"
					>
						{badge(item.href) > 9 ? '9+' : badge(item.href)}
					</span>
				{/if}
			</span>
			<span
				class="block w-full truncate text-center text-[calc(11px*var(--text-scale))] md:w-auto md:text-left md:text-sm"
				>{item.label}</span
			>
		</a>
	{/each}

	<a
		href="/"
		class="hidden items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 font-semibold text-accent-ink transition hover:bg-accent/90 md:mt-2 md:flex"
	>
		<Icon name="plus" size={18} />
		Beitrag
	</a>

	<div class="hidden md:mt-auto md:block">
		{#if session.account}
			<div class="flex items-center gap-2 rounded-lg px-1 py-2">
				<a
					href={`/accounts/${session.account.id}`}
					class="flex min-w-0 flex-1 items-center gap-2 rounded-lg hover:opacity-80"
					title="Eigenes Profil"
				>
					<Avatar src={session.account.avatar_static} alt={session.account.username} size={36} />
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-ink-strong">{@html accountName}</p>
						<p class="truncate text-xs text-ink-faint">@{session.account.acct}</p>
					</div>
				</a>
				<button
					type="button"
					onclick={() => session.logout()}
					class="rounded-md p-1.5 text-ink-faint hover:bg-accent/10 hover:text-ink-strong"
					title="Abmelden"
				>
					<Icon name="logout" size={18} />
				</button>
			</div>
		{/if}
	</div>
</nav>

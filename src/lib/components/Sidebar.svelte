<script lang="ts">
	import { page } from '$app/state';
	import { session } from '#lib/auth/session.svelte.ts';
	import { notificationsFeed } from '#lib/stores/notifications.svelte.ts';
	import { emojify } from '#lib/utils/text.ts';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';

	const items = [
		{ href: '/', label: 'Start', icon: 'home' },
		{ href: '/notifications', label: 'Meldungen', icon: 'bell' },
		{ href: '/local', label: 'Lokal', icon: 'globe' }
	];

	function isActive(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}

	const accountName = $derived(
		session.account
			? emojify(session.account.display_name || session.account.username, session.account.emojis)
			: ''
	);
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-emerald-400/10 bg-[#07110b]/95 px-2 py-1.5 backdrop-blur md:sticky md:top-0 md:h-dvh md:w-60 md:flex-col md:items-stretch md:justify-start md:gap-1 md:border-t-0 md:border-r md:bg-transparent md:px-4 md:py-6"
>
	<a href="/" class="hidden items-center gap-2 px-2 py-3 md:flex" aria-label="Phosphor">
		<Icon name="sparkles" size={22} class="text-emerald-400" />
		<span class="text-lg font-bold tracking-tight text-emerald-300">phosphor</span>
	</a>

	{#each items as item (item.href)}
		<a
			href={item.href}
			class="relative flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-emerald-300/60 transition hover:bg-emerald-400/10 hover:text-emerald-200 md:flex-row md:gap-3 md:px-3 md:py-2.5 md:text-base"
			class:text-emerald-300={isActive(item.href)}
			onclick={() => notificationsFeed.markAllRead()}
		>
			<span class="relative">
				<Icon name={item.icon} size={22} />
				{#if item.href === '/notifications' && notificationsFeed.unread > 0}
					<span
						class="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#07110b]"
					></span>
				{/if}
			</span>
			<span class="text-[11px] md:text-sm">{item.label}</span>
		</a>
	{/each}

	<a
		href="/"
		class="hidden items-center justify-center gap-2 rounded-full bg-emerald-500/90 px-4 py-2.5 font-semibold text-emerald-950 transition hover:bg-emerald-400 md:mt-2 md:flex"
	>
		<Icon name="plus" size={18} />
		Beitrag
	</a>

	<div class="hidden md:mt-auto md:block">
		{#if session.account}
			<div class="flex items-center gap-2 rounded-lg px-1 py-2">
				<Avatar src={session.account.avatar_static} alt={session.account.username} size={36} />
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium text-emerald-50">{@html accountName}</p>
					<p class="truncate text-xs text-emerald-300/50">@{session.account.acct}</p>
				</div>
				<button
					type="button"
					onclick={() => session.logout()}
					class="rounded-md p-1.5 text-emerald-300/50 hover:bg-emerald-400/10 hover:text-emerald-200"
					title="Abmelden"
				>
					<Icon name="logout" size={18} />
				</button>
			</div>
		{/if}
	</div>
</nav>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import Icon from '#lib/components/Icon.svelte';
	import Sidebar from '#lib/components/Sidebar.svelte';
	import type { Notification, Status } from '#lib/api/types.ts';
	import { session } from '#lib/auth/session.svelte.ts';
	import { homeFeed, localFeed } from '#lib/stores/feed.svelte.ts';
	import { notificationsFeed } from '#lib/stores/notifications.svelte.ts';
	import { preferences } from '#lib/stores/preferences.svelte.ts';
	import { streamer } from '#lib/stores/streamer.svelte.ts';

	let { children }: LayoutProps = $props();

	const isAuthRoute = $derived(page.url.pathname === '/login' || page.url.pathname === '/callback');

	onMount(() => {
		preferences.init();
		void session.init();
	});

	// Keep the WebSocket and feeds in sync with the auth state.
	$effect(() => {
		const token = session.token;
		if (token && session.loggedIn) {
			streamer.connect(token);
			void homeFeed.load();
		} else {
			streamer.disconnect();
			homeFeed.reset();
			localFeed.reset();
			notificationsFeed.reset();
		}
	});

	// Fan the single stream out into the stores.
	$effect(() => {
		return streamer.subscribe((event) => {
			switch (event.event) {
				case 'update':
					homeFeed.prepend(event.payload as Status);
					break;
				case 'delete':
					homeFeed.remove(String(event.payload));
					break;
				case 'status.update':
					homeFeed.replace(event.payload as Status);
					break;
				case 'notification':
					notificationsFeed.prepend(event.payload as Notification);
					break;
			}
		});
	});

	// Route guard.
	$effect(() => {
		if (!session.ready) return;
		const path = page.url.pathname;
		const publicRoute = path === '/login' || path === '/callback';
		if (!session.loggedIn && !publicRoute) void goto('/login');
		else if (session.loggedIn && path === '/login') void goto('/');
	});
</script>

<svelte:head>
	<title>Phosphor</title>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if !session.ready}
	<div class="flex min-h-dvh items-center justify-center font-mono text-accent">
		<div class="text-center">
			<p class="text-sm tracking-[0.3em]">PHOSPHOR</p>
			<p class="mt-1 animate-pulse text-xs text-ink-soft">booting…</p>
		</div>
	</div>
{:else if isAuthRoute}
	{@render children()}
{:else if session.loggedIn}
	<div class="mx-auto flex min-h-dvh w-full max-w-6xl">
		<Sidebar />
		<main class="min-h-dvh w-full max-w-2xl flex-1 border-line pb-16 md:border-x md:pb-0">
			{@render children()}
		</main>
	</div>
{:else}
	<div class="flex min-h-dvh items-center justify-center text-ink-faint">
		<Icon name="refresh" size={24} class="animate-spin" />
	</div>
{/if}

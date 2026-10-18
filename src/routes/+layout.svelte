<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
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
	import { applyStatusRemoval, applyStatusUpdate } from '#lib/stores/statusSync.ts';
	import { pushStore } from '#lib/push/push.svelte.ts';
	import { streamer } from '#lib/stores/streamer.svelte.ts';

	let { children }: LayoutProps = $props();

	const isAuthRoute = $derived(page.url.pathname === '/login' || page.url.pathname === '/callback');

	onMount(() => {
		preferences.init();
		pushStore.init();
		void session.init();
	});

	/**
	 * When a mobile PWA is backgrounded the browser freezes the page: timers
	 * stop and the WebSocket silently dies. Nothing re-runs on its own when it
	 * comes back, so the app would keep showing whatever it had when it was
	 * frozen (the reported bug). On every resume we reconnect the stream and
	 * pull the posts and notifications that arrived in the meantime.
	 */
	onMount(() => {
		let lastRefresh = 0;

		function refresh(): void {
			if (document.visibilityState !== 'visible') return;
			// visibilitychange, focus, pageshow and online can all fire on a
			// single resume — collapse them into one refresh.
			const now = Date.now();
			if (now - lastRefresh < 5000) return;
			lastRefresh = now;

			const token = session.token;
			if (token && session.loggedIn) streamer.ensureConnected(token);
			void pullNew();
		}

		const onVisibility = () => refresh();
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) refresh();
		};

		// Safety net for a socket that dies while the app stays in the
		// foreground: only when it actually had to be reopened do we pull the
		// missed gap (a healthy connection makes this a no-op).
		const watchdog = setInterval(() => {
			if (document.visibilityState !== 'visible') return;
			const token = session.token;
			if (token && session.loggedIn && streamer.ensureConnected(token)) void pullNew();
		}, 60_000);

		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('focus', onVisibility);
		window.addEventListener('online', onVisibility);
		window.addEventListener('pageshow', onPageShow);
		// Page Lifecycle API (Chromium, i.e. Android PWAs).
		const doc = document as EventTarget;
		doc.addEventListener('resume', onVisibility);

		return () => {
			clearInterval(watchdog);
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('focus', onVisibility);
			window.removeEventListener('online', onVisibility);
			window.removeEventListener('pageshow', onPageShow);
			doc.removeEventListener('resume', onVisibility);
		};
	});

	/**
	 * Pull only the items newer than what we already show and insert them at the
	 * top. When the user is scrolled down we keep the viewport anchored on the
	 * same post, so a background refresh never yanks the page.
	 */
	async function pullNew(): Promise<void> {
		const root = document.documentElement;
		const beforeY = window.scrollY;
		const beforeHeight = root.scrollHeight;

		await Promise.all([homeFeed.loadNew(), localFeed.loadNew(), notificationsFeed.loadNew()]);
		await tick();

		const grew = root.scrollHeight - beforeHeight;
		if (grew > 0 && beforeY > 0) window.scrollBy(0, grew);
	}

	// Keep the WebSocket and feeds in sync with the auth state.
	$effect(() => {
		const token = session.token;
		if (token && session.loggedIn) {
			streamer.connect(token);
			void homeFeed.load();
			// Re-register an existing browser push subscription with the server,
			// so a token that only later gained the `push` scope still ends up
			// with a working subscription (see PushStore.refresh).
			void pushStore.refresh();
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
					applyStatusRemoval(String(event.payload));
					break;
				case 'status.update':
					applyStatusUpdate(event.payload as Status);
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
		<main class="min-h-dvh w-full max-w-2xl min-w-0 flex-1 border-line pb-16 md:border-x md:pb-0">
			{@render children()}
		</main>
	</div>
{:else}
	<div class="flex min-h-dvh items-center justify-center text-ink-faint">
		<Icon name="refresh" size={24} class="animate-spin" />
	</div>
{/if}

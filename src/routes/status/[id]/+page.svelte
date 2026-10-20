<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Composer from '#lib/components/Composer.svelte';
	import ReplyBox from '#lib/components/ReplyBox.svelte';
	import StatusCard from '#lib/components/StatusCard.svelte';
	import { getContext, getStatus } from '#lib/api/gotosocial.ts';
	import type { Status } from '#lib/api/types.ts';
	import { streamer } from '#lib/stores/streamer.svelte.ts';
	import {
		applyThreadRevision,
		insertReply,
		mergeStatus,
		removeFromThread,
		threadHas
	} from '#lib/utils/thread.ts';

	let status = $state<Status | null>(null);
	let ancestors = $state<Status[]>([]);
	let descendants = $state<Status[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	/** Post whose reply box is open (id, not object: the lists get rebuilt). */
	let replyingTo = $state<string | null>(null);

	const thread = $derived([...ancestors, ...(status ? [status] : []), ...descendants]);

	async function load(id: string): Promise<void> {
		loading = true;
		error = null;
		replyingTo = null;
		try {
			const [main, context] = await Promise.all([getStatus(id), getContext(id)]);
			status = main;
			ancestors = context.ancestors;
			descendants = context.descendants;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Beitrag konnte nicht geladen werden.';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		const id = page.params.id;
		if (id) void load(id);
	});

	/**
	 * Same idea as the layout's resume refresh, but for this conversation: while
	 * the app was suspended the socket was dead, so we re-read the thread and
	 * patch the statuses in place (no spinner, no scroll jump, and an opened CW
	 * stays open).
	 */
	onMount(() => {
		let lastRefresh = 0;

		async function refresh(): Promise<void> {
			if (document.visibilityState !== 'visible') return;
			const id = page.params.id;
			if (!id || loading) return;
			const now = Date.now();
			if (now - lastRefresh < 5000) return;
			lastRefresh = now;

			try {
				const [main, context] = await Promise.all([getStatus(id), getContext(id)]);
				if (!status || status.id !== main.id) return;
				ancestors = context.ancestors;
				descendants = context.descendants;
				mergeStatus(status, main);
			} catch {
				// best effort — the stream or the next resume retries
			}
		}

		const onVisible = () => void refresh();
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('online', onVisible);
		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('online', onVisible);
		};
	});

	/**
	 * Live updates: new replies from accounts we follow, edits and deletions
	 * arrive over the user stream (see docs/ARCHITECTURE.md for what GtS does
	 * and does not push).
	 */
	$effect(() => {
		return streamer.subscribe((event) => {
			switch (event.event) {
				case 'update': {
					const incoming = event.payload as Status;
					if (!status) break;
					const next = insertReply(descendants, status.id, incoming);
					if (!next) break;
					descendants = next;
					const parentId = incoming.in_reply_to_id;
					if (parentId && status.id === parentId) status.replies_count += 1;
					else {
						const parent = next.find((item) => item.id === parentId);
						if (parent) parent.replies_count += 1;
					}
					break;
				}
				case 'status.update': {
					const updated = event.payload as Status;
					applyThreadRevision(ancestors, updated);
					applyThreadRevision(descendants, updated);
					if (status && (status.id === updated.id || status.reblog?.id === updated.id)) {
						applyThreadRevision([status], updated);
					}
					break;
				}
				case 'delete':
					if (threadHas(thread, String(event.payload)) && status) {
						onDeleted(String(event.payload));
					}
					break;
			}
		});
	});

	/** Count a fresh reply against the post it answered, without a reload. */
	function onReplyPosted(created: Status): void {
		descendants = [...descendants, created];
		const parentId = created.in_reply_to_id;
		if (status && parentId === status.id) status.replies_count += 1;
		else {
			const parent = descendants.find((item) => item.id === parentId);
			if (parent) parent.replies_count += 1;
		}
	}

	/** Drop a deleted post from our local lists; leaving the page if it was the subject. */
	function onDeleted(id: string): void {
		ancestors = removeFromThread(ancestors, id);
		descendants = removeFromThread(descendants, id);
		if (status?.id === id || status?.reblog?.id === id) void goto('/');
	}
</script>

<header
	class="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur"
>
	<a
		href="/"
		class="rounded-md p-1 text-ink-soft hover:bg-accent/10 hover:text-ink-strong"
		aria-label="Zurück"
	>
		<Icon name="chevron-left" size={20} />
	</a>
	<h1 class="text-lg font-semibold tracking-tight text-ink-strong">Beitrag</h1>
</header>

{#if loading}
	<div class="flex justify-center py-12 text-ink-soft">
		<Icon name="refresh" size={24} class="animate-spin" />
	</div>
{:else if error}
	<div class="m-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
		{error}
	</div>
{:else if status}
	{#each ancestors as ancestor (ancestor.id)}
		<StatusCard
			status={ancestor}
			{onDeleted}
			onReply={() => (replyingTo = replyingTo === ancestor.id ? null : ancestor.id)}
		/>
		{#if replyingTo === ancestor.id}
			<ReplyBox
				status={ancestor.reblog ?? ancestor}
				onClose={() => (replyingTo = null)}
				onPosted={onReplyPosted}
			/>
		{/if}
	{/each}

	<StatusCard
		{status}
		detail
		{onDeleted}
		onReply={() => (replyingTo = replyingTo === status?.id ? null : (status?.id ?? null))}
	/>
	{#if replyingTo === status.id}
		<ReplyBox
			status={status.reblog ?? status}
			onClose={() => (replyingTo = null)}
			onPosted={onReplyPosted}
		/>
	{/if}

	<Composer inReplyTo={status} placeholder="Antwort schreiben…" onPosted={onReplyPosted} />

	{#each descendants as descendant (descendant.id)}
		<StatusCard
			status={descendant}
			{onDeleted}
			onReply={() => (replyingTo = replyingTo === descendant.id ? null : descendant.id)}
		/>
		{#if replyingTo === descendant.id}
			<ReplyBox
				status={descendant.reblog ?? descendant}
				onClose={() => (replyingTo = null)}
				onPosted={onReplyPosted}
			/>
		{/if}
	{/each}
{/if}

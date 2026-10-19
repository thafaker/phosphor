<script lang="ts">
	import { page } from '$app/state';
	import AccountHeader from '#lib/components/AccountHeader.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import TimelineView from '#lib/components/TimelineView.svelte';
	import {
		accountStatuses,
		followAccount,
		getAccount,
		getRelationship,
		unfollowAccount
	} from '#lib/api/gotosocial.ts';
	import type { Account, Relationship } from '#lib/api/types.ts';
	import { session } from '#lib/auth/session.svelte.ts';
	import { TimelineFeed } from '#lib/stores/feed.svelte.ts';
	import { followIntent } from '#lib/utils/account.ts';

	type Filter = 'posts' | 'replies' | 'media';

	const tabs: { value: Filter; label: string }[] = [
		{ value: 'posts', label: 'Beiträge' },
		{ value: 'replies', label: 'Mit Antworten' },
		{ value: 'media', label: 'Medien' }
	];

	let account = $state<Account | null>(null);
	let relationship = $state<Relationship | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let followBusy = $state(false);
	let followError = $state<string | null>(null);
	let filter = $state<Filter>('posts');

	const isSelf = $derived(Boolean(account && session.account?.id === account.id));

	// A fresh feed per account + filter: TimelineView drives loading and infinite
	// scroll, so switching a filter just swaps in a loader with new parameters.
	const feed = $derived(
		new TimelineFeed((params) =>
			accountStatuses(accountId(), {
				limit: params.limit ?? 20,
				maxId: params.maxId,
				excludeReplies: filter !== 'replies',
				onlyMedia: filter === 'media'
			})
		)
	);

	const emptyText = $derived.by(() => {
		if (isSelf) {
			return filter === 'media'
				? 'Du hast noch keine Medien-Beiträge.'
				: 'Du hast noch nichts gepostet.';
		}
		if (account?.locked && !relationship?.following) {
			return 'Dieses Profil ist privat — folge, um Beiträge zu sehen.';
		}
		return filter === 'media' ? 'Keine Medien-Beiträge.' : 'Noch keine Beiträge.';
	});

	function accountId(): string {
		return page.params.id ?? '';
	}

	// Reload whenever we navigate to a different account.
	$effect(() => {
		const id = page.params.id;
		if (!id) return;
		void load(id);
	});

	async function load(id: string): Promise<void> {
		loading = true;
		error = null;
		followError = null;
		account = null;
		relationship = null;
		try {
			account = await getAccount(id);
			// A missing relationship is not fatal — we simply cannot show the
			// current follow state and start from "Folgen".
			relationship = await getRelationship(id).catch(() => null);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Profil konnte nicht geladen werden.';
		} finally {
			loading = false;
		}
	}

	async function toggleFollow(): Promise<void> {
		if (!account || followBusy) return;
		followBusy = true;
		followError = null;
		try {
			relationship =
				followIntent(relationship) === 'follow'
					? await followAccount(account.id)
					: await unfollowAccount(account.id);
		} catch (err) {
			followError = err instanceof Error ? err.message : 'Aktion fehlgeschlagen.';
		} finally {
			followBusy = false;
		}
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
	<h1 class="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-ink-strong">
		{account ? `@${account.acct}` : 'Profil'}
	</h1>
</header>

{#if loading}
	<div class="flex justify-center py-12 text-ink-soft">
		<Icon name="refresh" size={24} class="animate-spin" />
	</div>
{:else if error}
	<div class="m-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
		{error}
	</div>
{:else if account}
	<AccountHeader
		{account}
		{relationship}
		busy={followBusy}
		error={followError}
		{isSelf}
		onToggleFollow={() => void toggleFollow()}
	/>

	<nav class="flex border-b border-line" aria-label="Beitragsarten">
		{#each tabs as tab (tab.value)}
			<button
				type="button"
				class="flex-1 border-b-2 px-3 py-2.5 text-sm transition {filter === tab.value
					? 'border-accent font-semibold text-ink-strong'
					: 'border-transparent text-ink-soft hover:bg-accent/5'}"
				aria-current={filter === tab.value ? 'true' : undefined}
				onclick={() => (filter = tab.value)}
			>
				{tab.label}
			</button>
		{/each}
	</nav>

	<TimelineView {feed} {emptyText} emptyHint="" onDeleted={(id) => feed.remove(id)} />
{/if}

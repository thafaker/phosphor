<script lang="ts">
	import { goto } from '$app/navigation';
	import Avatar from '#lib/components/Avatar.svelte';
	import Composer from '#lib/components/Composer.svelte';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import NewItemsPill from '#lib/components/NewItemsPill.svelte';
	import OfflineNotice from '#lib/components/OfflineNotice.svelte';
	import { search } from '#lib/api/gotosocial.ts';
	import type { Account, Conversation } from '#lib/api/types.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { session } from '#lib/auth/session.svelte.ts';
	import { conversationsFeed } from '#lib/stores/conversations.svelte.ts';
	import { network } from '#lib/stores/network.svelte.ts';
	import { emojify, stripHtml } from '#lib/utils/text.ts';
	import { relativeTime } from '#lib/utils/time.ts';

	let sentinel: HTMLDivElement | undefined = $state();
	let composing = $state(false);

	// New message: recipient picker
	let recipientQuery = $state('');
	let recipientResults = $state<Account[]>([]);
	let recipients = $state<Account[]>([]);
	let searchingRecipients = $state(false);
	let recipientError = $state<string | null>(null);
	let recipientTimer: ReturnType<typeof setTimeout> | undefined;

	let pendingDelete = $state<Conversation | null>(null);

	$effect(() => {
		void conversationsFeed.load();
	});

	/** A few pixels of tolerance for fractional scroll positions. */
	const TOP_THRESHOLD = 4;

	function atTop(): boolean {
		return window.scrollY < TOP_THRESHOLD;
	}

	function applyPendingIfAtTop(): void {
		if (conversationsFeed.pending.length && atTop()) conversationsFeed.applyPending();
	}

	function handleScroll(): void {
		applyPendingIfAtTop();
	}

	function showPending(): void {
		window.scrollTo({ top: 0, behavior: 'auto' });
		conversationsFeed.applyPending();
	}

	$effect(() => {
		applyPendingIfAtTop();
	});

	$effect(() => {
		const element = sentinel;
		if (!element) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void conversationsFeed.loadMore();
			},
			{ rootMargin: '800px' }
		);
		observer.observe(element);
		return () => observer.disconnect();
	});

	// Debounced account search for the recipient picker.
	$effect(() => {
		const q = recipientQuery.trim();
		if (recipientTimer) clearTimeout(recipientTimer);
		if (!composing || q.length < 2) {
			recipientResults = [];
			recipientError = null;
			searchingRecipients = false;
			return;
		}
		searchingRecipients = true;
		recipientError = null;
		recipientTimer = setTimeout(async () => {
			try {
				const res = await search({ q, type: 'accounts', limit: 10 });
				recipientResults = res.accounts.filter(
					(acc) => acc.id !== session.account?.id && !recipients.some((r) => r.id === acc.id)
				);
			} catch (err) {
				recipientError = err instanceof Error ? err.message : t('search.failed');
			} finally {
				searchingRecipients = false;
			}
		}, 300);
		return () => clearTimeout(recipientTimer);
	});

	function toggleCompose(): void {
		composing = !composing;
		if (!composing) {
			recipientQuery = '';
			recipientResults = [];
			recipients = [];
			recipientError = null;
		}
	}

	function addRecipient(account: Account): void {
		if (recipients.some((r) => r.id === account.id)) return;
		recipients = [...recipients, account];
		recipientQuery = '';
		recipientResults = [];
	}

	function removeRecipient(id: string): void {
		recipients = recipients.filter((r) => r.id !== id);
	}

	const initialMentions = $derived(
		recipients.length ? recipients.map((r) => `@${r.acct}`).join(' ') + ' ' : ''
	);
	const composeKey = $derived(recipients.map((r) => r.id).join(','));

	function participants(conversation: Conversation): string {
		if (!conversation.accounts.length) return t('messages.unknownParticipant');
		return conversation.accounts
			.map((account) => emojify(account.display_name || account.username, account.emojis))
			.join(', ');
	}

	function preview(conversation: Conversation): string {
		const status = conversation.last_status;
		if (!status) return t('messages.noPreview');
		if (status.spoiler_text) return status.spoiler_text;
		const text = stripHtml(status.content || '').trim();
		return text || t('messages.noPreview');
	}

	async function openConversation(conversation: Conversation): Promise<void> {
		if (conversation.unread) void conversationsFeed.markRead(conversation.id);
		const target = conversation.last_status?.id;
		if (target) await goto(`/status/${target}`);
	}

	async function onPosted(): Promise<void> {
		composing = false;
		recipientQuery = '';
		recipientResults = [];
		recipients = [];
		await conversationsFeed.load(true);
	}

	function askDelete(conversation: Conversation, event: MouseEvent): void {
		event.stopPropagation();
		pendingDelete = conversation;
	}
</script>

<header class="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
	<div class="flex items-center gap-3 px-4 py-3">
		<h1 class="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink-strong">
			<Icon name="mail" size={18} class="text-accent" />
			{t('messages.title')}
		</h1>
		<button
			type="button"
			class="ml-auto flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft transition hover:bg-accent/10 hover:text-ink-strong"
			onclick={toggleCompose}
			aria-expanded={composing}
		>
			<Icon name={composing ? 'close' : 'plus'} size={13} />
			{composing ? t('common.cancel') : t('messages.new')}
		</button>
	</div>
</header>

<svelte:window onscroll={handleScroll} />

{#if composing}
	<section class="border-b border-line bg-surface/30 px-4 py-3">
		<p class="mb-2 text-sm font-medium text-ink-strong">{t('messages.to')}</p>

		{#if recipients.length}
			<div class="mb-2 flex flex-wrap gap-2">
				{#each recipients as recipient (recipient.id)}
					<span
						class="flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-1 text-xs text-ink-strong"
					>
						@{recipient.acct}
						<button
							type="button"
							class="rounded-full p-0.5 text-ink-faint hover:bg-accent/10 hover:text-ink-strong"
							title={t('messages.removeRecipient')}
							aria-label={t('messages.removeRecipient')}
							onclick={() => removeRecipient(recipient.id)}
						>
							<Icon name="close" size={12} />
						</button>
					</span>
				{/each}
			</div>
		{/if}

		<div class="relative mb-3">
			<input
				type="search"
				bind:value={recipientQuery}
				placeholder={t('messages.recipientSearch')}
				class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-strong placeholder:text-ink-faint focus:border-accent/40 focus:outline-none"
			/>
			{#if searchingRecipients}
				<div class="absolute top-2.5 right-3 text-ink-faint">
					<Icon name="refresh" size={14} class="animate-spin" />
				</div>
			{/if}
			{#if recipientResults.length}
				<ul
					class="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-line bg-surface shadow-glow"
				>
					{#each recipientResults as account (account.id)}
						<li>
							<button
								type="button"
								class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent/10"
								onclick={() => addRecipient(account)}
							>
								<Avatar src={account.avatar_static} alt={account.username} size={32} />
								<div class="min-w-0">
									<div class="truncate text-sm font-medium text-ink-strong">
										{@html emojify(account.display_name || account.username, account.emojis)}
									</div>
									<div class="truncate text-xs text-ink-faint">@{account.acct}</div>
								</div>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		{#if recipientError}
			<p class="mb-2 text-sm text-danger">{recipientError}</p>
		{/if}

		{#if recipients.length}
			{#key composeKey}
				<Composer
					placeholder={t('composer.placeholder')}
					initialText={initialMentions}
					initialVisibility="direct"
					lockVisibility
					autofocus
					onPosted={() => void onPosted()}
				/>
			{/key}
		{:else}
			<p class="text-sm text-ink-faint">{t('messages.recipientHint')}</p>
		{/if}
	</section>
{/if}

<NewItemsPill
	count={conversationsFeed.pending.length}
	singular={t('messages.newOne')}
	plural={t('messages.newMany')}
	onclick={showPending}
	offsetClass="top-16"
/>

{#if conversationsFeed.stale && network.online}
	<OfflineNotice onRetry={() => conversationsFeed.load(true)} />
{/if}

{#if conversationsFeed.error}
	<div class="m-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
		{conversationsFeed.error}
	</div>
{/if}

{#if conversationsFeed.loading && !conversationsFeed.items.length}
	<div class="flex justify-center py-10 text-ink-soft">
		<Icon name="refresh" size={22} class="animate-spin" />
	</div>
{:else if !conversationsFeed.items.length && conversationsFeed.loaded}
	<div class="px-6 py-16 text-center text-ink-faint">
		<Icon name="mail" size={28} class="mx-auto mb-3 text-ink-soft" />
		<p>{t('messages.empty')}</p>
		<p class="mt-1 text-sm">{t('messages.emptyHint')}</p>
	</div>
{:else}
	<ul>
		{#each conversationsFeed.items as conversation (conversation.id)}
			{@const unread = conversation.unread}
			{@const names = participants(conversation)}
			{@const time = conversation.last_status?.created_at}
			<li class="border-b border-line {unread ? 'bg-accent/5' : ''}">
				<div class="flex items-start gap-3 px-4 py-3 transition hover:bg-surface/40">
					<button
						type="button"
						class="flex min-w-0 flex-1 items-start gap-3 text-left"
						onclick={() => void openConversation(conversation)}
					>
						<div class="relative shrink-0">
							{#if conversation.accounts[0]}
								<Avatar
									src={conversation.accounts[0].avatar_static}
									alt={conversation.accounts[0].username}
									size={40}
								/>
							{:else}
								<div
									class="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent"
								>
									<Icon name="user" size={18} />
								</div>
							{/if}
							{#if unread}
								<span
									class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-canvas"
									title={t('messages.unread')}
								></span>
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline gap-2">
								<p class="truncate text-sm font-medium text-ink-strong">{@html names}</p>
								{#if time}
									<span class="ml-auto shrink-0 text-xs text-ink-faint">{relativeTime(time)}</span>
								{/if}
							</div>
							<p class="mt-0.5 line-clamp-2 text-sm text-ink-soft">{preview(conversation)}</p>
						</div>
					</button>
					<button
						type="button"
						class="mt-1 shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"
						title={t('messages.delete')}
						aria-label={t('messages.delete')}
						onclick={(event) => askDelete(conversation, event)}
					>
						<Icon name="trash" size={16} />
					</button>
				</div>
			</li>
		{/each}
	</ul>

	<div bind:this={sentinel} class="flex h-16 items-center justify-center">
		{#if conversationsFeed.loading && conversationsFeed.items.length}
			<Icon name="refresh" size={18} class="animate-spin text-ink-faint" />
		{/if}
	</div>
{/if}

{#if pendingDelete}
	<ConfirmDialog
		title={t('messages.delete')}
		body={t('messages.deleteConfirm')}
		confirmLabel={t('common.delete')}
		danger
		onConfirm={async () => {
			await conversationsFeed.remove(pendingDelete!.id);
			pendingDelete = null;
		}}
		onClose={() => (pendingDelete = null)}
	/>
{/if}

<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		bookmark,
		favourite,
		reblog,
		unbookmark,
		unfavourite,
		unreblog
	} from '#lib/api/gotosocial.ts';
	import type { Status } from '#lib/api/types.ts';
	import { session } from '#lib/auth/session.svelte.ts';
	import { applyStatusUpdate } from '#lib/stores/statusSync.ts';
	import { formatCount } from '#lib/utils/format.ts';
	import { emojify, withExternalLinks } from '#lib/utils/text.ts';
	import { absoluteTime, relativeTime } from '#lib/utils/time.ts';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import MediaGrid from './MediaGrid.svelte';
	import StatusEditor from './StatusEditor.svelte';

	interface Props {
		status: Status;
		/** Roomier typography for the single-status (thread) view. */
		detail?: boolean;
	}

	let { status, detail = false }: Props = $props();

	// Seeded from the status so a CW starts collapsed; each card is keyed by id.
	// svelte-ignore state_referenced_locally
	let showContent = $state(!status.spoiler_text);
	let busy = $state(false);
	let editing = $state(false);

	/** Only the author may edit a post (GtS enforces it too). */
	const isOwn = $derived(session.account?.id === status.account.id);

	const name = $derived(status.account.display_name || status.account.username);
	const nameHtml = $derived(emojify(name, status.account.emojis));

	const visibilityIcon = $derived(
		status.visibility === 'private' ? 'lock' : status.visibility === 'direct' ? 'at' : 'globe'
	);

	async function toggleFavourite() {
		if (busy) return;
		busy = true;
		const next = !status.favourited;
		status.favourited = next;
		status.favourites_count += next ? 1 : -1;
		try {
			const updated = next ? await favourite(status.id) : await unfavourite(status.id);
			status.favourited = updated.favourited;
			status.favourites_count = updated.favourites_count;
		} catch {
			status.favourited = !next;
			status.favourites_count += next ? -1 : 1;
		} finally {
			busy = false;
		}
	}

	async function toggleReblog() {
		if (busy) return;
		busy = true;
		const next = !status.reblogged;
		status.reblogged = next;
		status.reblogs_count += next ? 1 : -1;
		try {
			const updated = next ? await reblog(status.id) : await unreblog(status.id);
			// GtS answers the reblog call with the boost *wrapper*: it carries no
			// reblogs_count of its own (always 0), so read from the boosted status.
			const result = updated.reblog ?? updated;
			status.reblogged = result.reblogged;
			status.reblogs_count = result.reblogs_count;
		} catch {
			status.reblogged = !next;
			status.reblogs_count += next ? -1 : 1;
		} finally {
			busy = false;
		}
	}

	async function toggleBookmark() {
		if (busy) return;
		busy = true;
		const next = !status.bookmarked;
		status.bookmarked = next;
		try {
			const updated = next ? await bookmark(status.id) : await unbookmark(status.id);
			status.bookmarked = updated.bookmarked;
		} catch {
			status.bookmarked = !next;
		} finally {
			busy = false;
		}
	}

	function pollPercent(count: number | null): number {
		if (!status.poll?.votes_count || count === null) return 0;
		return Math.round((count / status.poll.votes_count) * 100);
	}

	/**
	 * Clicking anywhere on a card (that is not an interactive control or a
	 * text selection) opens the thread view, so replies become reachable.
	 * Keyboard users already have the timestamp/reply links inside the card.
	 */
	function openThread(event: MouseEvent) {
		if (detail) return;
		if (event.defaultPrevented || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('a, button, input, select, textarea, label, [data-no-open]')) return;
		if (window.getSelection()?.toString()) return;
		void goto(`/status/${status.id}`);
	}

	/**
	 * Reflect a successful edit. Mutating the status in place updates the thread
	 * view (which holds its own copy), while `applyStatusUpdate` patches the
	 * timelines and notifications that show the same post.
	 */
	function onEdited(updated: Status): void {
		status.content = updated.content;
		status.spoiler_text = updated.spoiler_text;
		status.sensitive = updated.sensitive;
		status.edited_at = updated.edited_at;
		status.language = updated.language;
		status.poll = updated.poll;
		status.media_attachments = updated.media_attachments;
		applyStatusUpdate(updated);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<article class="flex gap-3 px-4 py-3" class:cursor-pointer={!detail} onclick={openThread}>
	<a href={status.account.url} target="_blank" rel="noopener noreferrer" class="shrink-0">
		<Avatar src={status.account.avatar_static} alt={name} size={detail ? 52 : 44} />
	</a>

	<div class="min-w-0 flex-1">
		<header class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
			<a
				href={status.account.url}
				target="_blank"
				rel="noopener noreferrer"
				class="font-semibold text-ink-strong hover:underline"
			>
				{@html nameHtml}
			</a>
			<span class="text-ink-faint">@{status.account.acct}</span>
			<span class="text-ink-faint">·</span>
			<a
				href={`/status/${status.id}`}
				title={absoluteTime(status.created_at)}
				class="text-ink-faint hover:text-ink-strong"
			>
				{relativeTime(status.created_at)}
			</a>
			<Icon name={visibilityIcon} size={13} class="text-ink-faint" />
			{#if status.edited_at}
				<span class="text-ink-faint">· bearbeitet</span>
			{/if}
			{#if isOwn}
				<button
					type="button"
					title="Beitrag bearbeiten"
					class="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-ink-faint hover:bg-accent/10 hover:text-ink-strong"
					onclick={() => (editing = true)}
				>
					<Icon name="pencil" size={14} />
					Bearbeiten
				</button>
			{/if}
		</header>

		{#if status.spoiler_text}
			<div class="mt-1.5">
				<p class="text-sm text-warn">
					<span class="font-semibold">CW:</span>
					{status.spoiler_text}
				</p>
				<button
					type="button"
					class="mt-1 rounded-md border border-accent/40 px-2 py-1 text-xs text-ink hover:bg-accent/10"
					onclick={() => (showContent = !showContent)}
				>
					{showContent ? 'Inhalt verbergen' : 'Inhalt anzeigen'}
				</button>
			</div>
		{/if}

		{#if showContent}
			<div
				class="status-content mt-1 text-post leading-relaxed break-words text-ink"
				class:text-base={detail}
			>
				<!-- GoToSocial returns sanitised HTML here. -->
				{@html withExternalLinks(status.content)}
			</div>

			<MediaGrid attachments={status.media_attachments} sensitive={status.sensitive} />

			{#if status.poll}
				<ul class="mt-3 space-y-1.5">
					{#each status.poll.options as option, index (index)}
						<li class="relative overflow-hidden rounded-md border border-line text-sm">
							<div
								class="absolute inset-y-0 left-0 bg-accent/15"
								style="width: {pollPercent(option.votes_count)}%"
							></div>
							<div class="relative flex justify-between px-2.5 py-1.5">
								<span>{option.title}</span>
								<span class="text-ink-soft">{option.votes_count ?? 0}</span>
							</div>
						</li>
					{/each}
				</ul>
				<p class="mt-1 text-xs text-ink-faint">
					{status.poll.votes_count} Stimmen
					{status.poll.expired ? '· beendet' : ''}
				</p>
			{/if}

			{#if status.card && !status.media_attachments.length}
				<a
					href={status.card.url}
					target="_blank"
					rel="noopener noreferrer"
					class="mt-3 block overflow-hidden rounded-lg border border-line hover:bg-accent/5"
				>
					{#if status.card.image}
						<img
							src={status.card.image}
							alt=""
							loading="lazy"
							referrerpolicy="no-referrer"
							class="max-h-64 w-full object-cover"
						/>
					{/if}
					<div class="p-3">
						{#if status.card.provider_name}
							<p class="text-xs tracking-wide text-ink-faint uppercase">
								{status.card.provider_name}
							</p>
						{/if}
						<p class="font-medium text-ink-strong">{status.card.title}</p>
						<p class="mt-0.5 line-clamp-2 text-sm text-ink-soft">
							{status.card.description}
						</p>
					</div>
				</a>
			{/if}
		{/if}

		<footer class="mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-ink-soft">
			<a
				href={`/status/${status.id}`}
				class="flex items-center gap-1.5 text-sm hover:text-ink-strong"
				title="Antworten"
			>
				<Icon name="reply" size={17} />
				<span class="text-xs">{formatCount(status.replies_count)}</span>
			</a>

			<button
				type="button"
				class="flex items-center gap-1.5 text-sm hover:text-accent"
				class:text-accent={status.reblogged}
				onclick={toggleReblog}
				title="Boosten"
			>
				<Icon name="boost" size={17} />
				<span class="text-xs">{formatCount(status.reblogs_count)}</span>
			</button>

			<button
				type="button"
				class="flex items-center gap-1.5 text-sm hover:text-warn"
				class:text-warn={status.favourited}
				onclick={toggleFavourite}
				title="Favorisieren"
			>
				<Icon name="star" size={17} filled={status.favourited} />
				<span class="text-xs">{formatCount(status.favourites_count)}</span>
			</button>

			<button
				type="button"
				class="ml-auto flex items-center gap-1.5 text-sm hover:text-accent"
				class:text-accent={status.bookmarked}
				onclick={toggleBookmark}
				title="Merken"
			>
				<Icon name="bookmark" size={17} filled={status.bookmarked} />
			</button>
		</footer>
	</div>

	{#if editing}
		<StatusEditor {status} onClose={() => (editing = false)} onSaved={onEdited} />
	{/if}
</article>

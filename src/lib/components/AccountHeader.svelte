<script lang="ts">
	import type { Account, Relationship } from '#lib/api/types.ts';
	import { followLabel } from '#lib/utils/account.ts';
	import { formatStat } from '#lib/utils/format.ts';
	import { emojify, withExternalLinks } from '#lib/utils/text.ts';
	import { absoluteDate } from '#lib/utils/time.ts';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		account: Account;
		/** null when the server has no relationship (e.g. a not-yet-resolved account). */
		relationship: Relationship | null;
		busy?: boolean;
		/** Error from the last follow/unfollow attempt. */
		error?: string | null;
		/** Own profile: no follow button. */
		isSelf?: boolean;
		onToggleFollow: () => void;
	}

	let {
		account,
		relationship,
		busy = false,
		error = null,
		isSelf = false,
		onToggleFollow
	}: Props = $props();

	const nameHtml = $derived(emojify(account.display_name || account.username, account.emojis));
	const following = $derived(Boolean(relationship?.following || relationship?.requested));
	const label = $derived(followLabel(relationship));
</script>

<section class="border-b border-line">
	<div class="h-36 bg-inset sm:h-48">
		{#if account.header}
			<img
				src={account.header}
				alt=""
				referrerpolicy="no-referrer"
				class="h-full w-full object-cover"
			/>
		{/if}
	</div>

	<div class="px-4 pb-4">
		<!-- The avatar overlaps the header by half its height; both scale with the
		     accessibility text size, hence the inline calc instead of -mt-10. -->
		<div
			class="flex items-end justify-between gap-3"
			style="margin-top: calc(-40px * var(--ui-scale))"
		>
			<Avatar
				src={account.avatar_static}
				alt={account.display_name || account.username}
				size={80}
				class="ring-4 ring-canvas"
			/>

			{#if !isSelf}
				<button
					type="button"
					disabled={busy}
					title={relationship?.requested && !relationship.following
						? 'Anfrage zurückziehen'
						: label}
					onclick={onToggleFollow}
					class="rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 {following
						? 'border border-line text-ink hover:bg-danger/10 hover:text-danger'
						: 'bg-accent text-accent-ink hover:bg-accent/90'}"
				>
					{busy ? '…' : label}
				</button>
			{/if}
		</div>

		<div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
			<h2 class="text-xl font-bold text-ink-strong">{@html nameHtml}</h2>
			{#if isSelf}
				<span
					class="rounded-full border border-line px-2 py-0.5 text-[calc(11px*var(--text-scale))] text-ink-faint"
				>
					Du
				</span>
			{/if}
			{#if account.bot}
				<span
					class="rounded-full border border-accent/40 px-2 py-0.5 text-[calc(11px*var(--text-scale))] text-accent"
				>
					Bot
				</span>
			{/if}
			{#if account.locked}
				<span
					class="flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[calc(11px*var(--text-scale))] text-ink-soft"
					title="Profil ist privat ✱ Folgeanfragen müssen bestätigt werden"
				>
					<Icon name="lock" size={12} />
					Privat
				</span>
			{/if}
			{#if relationship?.followed_by && !isSelf}
				<span
					class="rounded-md bg-accent/10 px-1.5 py-0.5 text-[calc(11px*var(--text-scale))] text-accent"
				>
					Folgt dir
				</span>
			{/if}
		</div>

		<p class="text-sm text-ink-faint">@{account.acct}</p>

		{#if account.note}
			<div class="status-content mt-3 text-post leading-relaxed break-words text-ink">
				<!-- Bio and field values arrive as HTML (same convention as Mastodon,
				     which renders them client-side too). -->
				{@html withExternalLinks(account.note)}
			</div>
		{/if}

		{#if account.fields.length}
			<dl class="mt-3 grid gap-1.5 sm:grid-cols-2">
				{#each account.fields as field (field.name + field.value)}
					<div class="overflow-hidden rounded-md border border-line bg-surface px-3 py-1.5">
						<dt class="truncate text-xs font-semibold tracking-wide text-ink-faint uppercase">
							{@html emojify(field.name, account.emojis)}
						</dt>
						<dd class="status-content text-sm text-ink">
							{@html field.value}
							{#if field.verified_at}
								<Icon name="check" size={13} class="ml-1 inline align-text-bottom text-accent" />
							{/if}
						</dd>
					</div>
				{/each}
			</dl>
		{/if}

		<p class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
			<span
				><strong class="text-ink-strong">{formatStat(account.statuses_count)}</strong> Beiträge</span
			>
			<span
				><strong class="text-ink-strong">{formatStat(account.following_count)}</strong> Folgt</span
			>
			<span
				><strong class="text-ink-strong">{formatStat(account.followers_count)}</strong> Follower</span
			>
		</p>

		{#if error}
			<p class="mt-2 text-sm text-danger">{error}</p>
		{/if}

		<p class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
			<span>Beigetreten am {absoluteDate(account.created_at)}</span>
			<a
				href={account.url}
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-1 hover:text-ink-strong"
			>
				<Icon name="link-out" size={13} />
				Originalprofil
			</a>
		</p>
	</div>
</section>

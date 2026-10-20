<script lang="ts">
	import type { Account, Relationship } from '#lib/api/types.ts';
	import { followLabel } from '#lib/utils/account.ts';
	import { formatStat } from '#lib/utils/format.ts';
	import { emojify, withExternalLinks } from '#lib/utils/text.ts';
	import { absoluteDate } from '#lib/utils/time.ts';
	import Avatar from './Avatar.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
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
		/** Mute/unmute; omitted while the relationship is unknown. */
		onToggleMute?: () => void;
		/** Block/unblock — the caller shows the confirmation dialog. */
		onToggleBlock?: () => void;
		/** Answer a pending request from this account (private profile). */
		onAcceptRequest?: () => void;
		onRejectRequest?: () => void;
		/** True while a mute/block/request call is in flight. */
		moderationBusy?: boolean;
	}

	let {
		account,
		relationship,
		busy = false,
		error = null,
		isSelf = false,
		onToggleFollow,
		onToggleMute,
		onToggleBlock,
		onAcceptRequest,
		onRejectRequest,
		moderationBusy = false
	}: Props = $props();

	const nameHtml = $derived(emojify(account.display_name || account.username, account.emojis));
	const following = $derived(Boolean(relationship?.following || relationship?.requested));
	const label = $derived(followLabel(relationship));

	/** They asked us to follow them back (only possible on a private profile). */
	const awaitingAnswer = $derived(Boolean(relationship?.requested_by && !relationship?.following));
	const blocked = $derived(Boolean(relationship?.blocking));
	const muted = $derived(Boolean(relationship?.muting));
	const blockedBy = $derived(Boolean(relationship?.blocked_by));

	let confirmingBlock = $state(false);
	let menuOpen = $state(false);
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
				<div class="flex items-center gap-2">
					{#if awaitingAnswer}
						<button
							type="button"
							disabled={moderationBusy}
							class="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
							onclick={() => onAcceptRequest?.()}
						>
							Annehmen
						</button>
						<button
							type="button"
							disabled={moderationBusy}
							class="rounded-full border border-line px-4 py-1.5 text-sm text-ink transition hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
							onclick={() => onRejectRequest?.()}
						>
							Ablehnen
						</button>
					{:else}
						<button
							type="button"
							disabled={moderationBusy || !relationship}
							title={relationship?.muting ? 'Nicht mehr stummschalten' : 'Stummschalten'}
							aria-pressed={muted}
							class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 {muted
								? 'border-warn/50 bg-warn/10 text-warn'
								: 'border-line text-ink-soft hover:bg-accent/10 hover:text-ink-strong'}"
							onclick={() => onToggleMute?.()}
						>
							<Icon name="volume-off" size={15} />
							Stumm
						</button>

						<div class="relative">
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

							<button
								type="button"
								title="Weitere Aktionen"
								aria-label="Weitere Aktionen"
								aria-expanded={menuOpen}
								onclick={() => (menuOpen = !menuOpen)}
								class="ml-1 rounded-md p-1.5 text-ink-soft hover:bg-accent/10 hover:text-ink-strong"
							>
								<Icon name="dots" size={18} />
							</button>

							{#if menuOpen}
								<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
								<div
									class="fixed inset-0 z-30"
									data-no-open
									onclick={() => (menuOpen = false)}
								></div>
								<div
									class="absolute top-full right-0 z-40 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-glow"
								>
									<button
										type="button"
										disabled={moderationBusy}
										class="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-accent/10 disabled:opacity-40"
										onclick={() => {
											menuOpen = false;
											onToggleMute?.();
										}}
									>
										{relationship?.muting ? 'Nicht mehr stummschalten' : 'Stummschalten'}
									</button>
									<button
										type="button"
										disabled={moderationBusy}
										class="block w-full px-3 py-2 text-left text-sm disabled:opacity-40 {relationship?.blocking
											? 'text-ink hover:bg-accent/10'
											: 'text-danger hover:bg-danger/10'}"
										onclick={() => {
											menuOpen = false;
											if (relationship?.blocking) onToggleBlock?.();
											else confirmingBlock = true;
										}}
									>
										{relationship?.blocking ? 'Blockierung aufheben' : 'Blockieren'}
									</button>
								</div>
							{/if}
						</div>
					{/if}
				</div>
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
			{#if muted}
				<span
					class="flex items-center gap-1 rounded-md border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[calc(11px*var(--text-scale))] text-warn"
					title="Beiträge und Meldungen dieser Person sind ausgeblendet"
				>
					<Icon name="volume-off" size={12} />
					Stummgeschaltet
				</span>
			{/if}
			{#if blocked}
				<span
					class="flex items-center gap-1 rounded-md border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[calc(11px*var(--text-scale))] text-danger"
				>
					<Icon name="slash" size={12} />
					Blockiert
				</span>
			{/if}
			{#if blockedBy}
				<span
					class="flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[calc(11px*var(--text-scale))] text-ink-soft"
					title="Diese Person blockiert dich — ihr könnt euch nicht folgen und keine Beiträge sehen"
				>
					<Icon name="slash" size={12} />
					Hat dich blockiert
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

	{#if confirmingBlock}
		<ConfirmDialog
			title={`@${account.acct} blockieren?`}
			body="Die Person kann dir nicht mehr folgen, dir keine Beiträge mehr schicken und sieht deine Beiträge nicht mehr. Eine bestehende Verbindung wird getrennt. Du kannst die Blockierung jederzeit aufheben."
			confirmLabel="Blockieren"
			danger
			onConfirm={() => onToggleBlock?.()}
			onClose={() => (confirmingBlock = false)}
		/>
	{/if}
</section>

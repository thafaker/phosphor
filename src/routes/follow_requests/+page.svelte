<script lang="ts">
	import { onMount } from 'svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { followRequests } from '#lib/stores/followRequests.svelte.ts';
	import { refreshEvent } from '#lib/stores/refresh.svelte.ts';
	import { absoluteDate } from '#lib/utils/time.ts';
	import { emojify, withExternalLinks } from '#lib/utils/text.ts';

	// Always re-read on open: a request may have been handled on another device,
	// and there is no pagination here to preserve. Pull-to-refresh triggers the
	// same reload. `subscribe` returns its own teardown.
	onMount(() => {
		void followRequests.load(true);
		return refreshEvent.subscribe(() => void followRequests.load(true));
	});
</script>

<header class="sticky top-0 z-20 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur">
	<h1 class="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink-strong">
		<Icon name="user-plus" size={18} class="text-accent" />
		Folgeanfragen
	</h1>
</header>

{#if followRequests.error}
	<div
		class="m-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
	>
		<Icon name="alert" size={18} />
		<span class="flex-1">{followRequests.error}</span>
		<button
			type="button"
			class="rounded-md border border-danger/40 px-2 py-1 text-xs hover:bg-danger/10"
			onclick={() => followRequests.load(true)}
		>
			Erneut versuchen
		</button>
	</div>
{/if}

{#if followRequests.loading && !followRequests.items.length}
	<div class="flex justify-center py-10 text-ink-soft">
		<Icon name="refresh" size={22} class="animate-spin" />
	</div>
{:else if !followRequests.items.length && followRequests.loaded}
	<div class="px-6 py-16 text-center text-ink-faint">
		<Icon name="user-plus" size={28} class="mx-auto mb-3 text-ink-soft" />
		<p>Keine offenen Anfragen.</p>
		<p class="mt-1 text-sm">Anfragen erscheinen hier, solange dein Profil privat ist.</p>
	</div>
{:else}
	<ul>
		{#each followRequests.items as account (account.id)}
			{@const name = account.display_name || account.username}
			{@const busy = Boolean(followRequests.busy[account.id])}
			<li class="border-b border-line px-4 py-3">
				<div class="flex items-start gap-3">
					<a href={`/accounts/${account.id}`} class="shrink-0" title={`@${account.acct}`}>
						<Avatar src={account.avatar_static} alt={name} size={44} />
					</a>

					<div class="min-w-0 flex-1">
						<a
							href={`/accounts/${account.id}`}
							class="font-semibold text-ink-strong hover:underline"
						>
							{@html emojify(name, account.emojis)}
						</a>
						<span class="ml-1 text-sm text-ink-faint">@{account.acct}</span>
						<span class="ml-1 text-xs text-ink-faint">
							· aufgenommen am {absoluteDate(account.created_at)}
						</span>

						{#if account.note}
							<div class="status-content mt-1 line-clamp-3 text-sm break-words text-ink-soft">
								{@html withExternalLinks(account.note)}
							</div>
						{/if}

						<div class="mt-2 flex items-center gap-2">
							<button
								type="button"
								disabled={busy}
								class="rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-ink transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
								onclick={() => void followRequests.accept(account.id)}
							>
								Annehmen
							</button>
							<button
								type="button"
								disabled={busy}
								class="rounded-full border border-line px-3.5 py-1.5 text-sm text-ink transition hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
								onclick={() => void followRequests.reject(account.id)}
							>
								Ablehnen
							</button>
						</div>
					</div>
				</div>
			</li>
		{/each}
	</ul>
{/if}

<script lang="ts">
	import { postStatus } from '#lib/api/gotosocial.ts';
	import type { Status, Visibility } from '#lib/api/types.ts';
	import { session } from '#lib/auth/session.svelte.ts';
	import { emojify } from '#lib/utils/text.ts';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		inReplyTo?: Status | null;
		placeholder?: string;
		autofocus?: boolean;
		onPosted?: (status: Status) => void;
	}

	let {
		inReplyTo = null,
		placeholder = 'Was gibt es Neues?',
		autofocus = false,
		onPosted
	}: Props = $props();

	let text = $state('');
	let cwEnabled = $state(false);
	let spoilerText = $state('');
	// Default to the visibility of the status we're replying to (initial value only).
	// svelte-ignore state_referenced_locally
	let visibility = $state<Visibility>(inReplyTo?.visibility ?? 'public');
	let submitting = $state(false);
	let error = $state<string | null>(null);

	const remaining = $derived(session.maxChars - text.length);
	const canSubmit = $derived(
		text.trim().length > 0 && remaining >= 0 && !submitting && !(cwEnabled && !spoilerText.trim())
	);

	const replyName = $derived(
		inReplyTo
			? emojify(
					inReplyTo.account.display_name || inReplyTo.account.username,
					inReplyTo.account.emojis
				)
			: ''
	);

	async function submit() {
		if (!canSubmit) return;
		submitting = true;
		error = null;
		try {
			const created = await postStatus({
				status: text,
				spoilerText: cwEnabled ? spoilerText : undefined,
				visibility,
				inReplyToId: inReplyTo?.id
			});
			text = '';
			spoilerText = '';
			cwEnabled = false;
			onPosted?.(created);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Beitrag konnte nicht gesendet werden.';
		} finally {
			submitting = false;
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			void submit();
		}
	}
</script>

<section class="border-b border-emerald-400/10 px-4 py-3">
	{#if inReplyTo}
		<p class="mb-2 text-sm text-emerald-300/60">
			Antwort an {@html replyName}
		</p>
	{/if}

	<div class="flex gap-3">
		<Avatar
			src={session.account?.avatar_static ?? ''}
			alt={session.account?.username ?? ''}
			size={44}
		/>

		<div class="min-w-0 flex-1">
			{#if cwEnabled}
				<input
					type="text"
					bind:value={spoilerText}
					placeholder="Inhaltswarnung (CW)"
					class="mb-2 w-full rounded-md border border-amber-300/30 bg-black/30 px-3 py-1.5 text-sm text-amber-100 placeholder-amber-200/40 outline-none focus:border-amber-300/60"
				/>
			{/if}

			<!-- svelte-ignore a11y_autofocus -->
			<textarea
				bind:value={text}
				{placeholder}
				{autofocus}
				rows={inReplyTo ? 2 : 3}
				onkeydown={onKeydown}
				class="w-full resize-none bg-transparent text-[0.95rem] leading-relaxed text-emerald-50 placeholder-emerald-300/40 outline-none"
			></textarea>

			<div class="mt-2 flex items-center gap-2">
				<button
					type="button"
					class="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-emerald-400/10 {cwEnabled
						? 'text-amber-300'
						: 'text-emerald-300/60'}"
					onclick={() => (cwEnabled = !cwEnabled)}
					title="Inhaltswarnung"
				>
					<Icon name="alert" size={15} />
					CW
				</button>

				<label class="flex items-center gap-1 text-xs text-emerald-300/60">
					<Icon name="globe" size={15} />
					<select
						bind:value={visibility}
						class="cursor-pointer rounded-md bg-transparent py-1 pr-1 text-xs text-emerald-200 outline-none hover:bg-emerald-400/10"
					>
						<option value="public">Öffentlich</option>
						<option value="unlisted">Nicht gelistet</option>
						<option value="private">Nur Follower</option>
						<option value="direct">Direkt</option>
					</select>
				</label>

				<span
					class="ml-auto text-xs tabular-nums {remaining < 0
						? 'text-red-400'
						: remaining <= 200
							? 'text-amber-300'
							: 'text-emerald-300/40'}"
				>
					{remaining}
				</span>

				<button
					type="button"
					disabled={!canSubmit}
					onclick={submit}
					class="flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-3.5 py-1.5 text-sm font-semibold text-emerald-950 transition enabled:hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
				>
					<Icon name="send" size={15} />
					{submitting ? 'Sendet…' : 'Posten'}
				</button>
			</div>

			{#if error}
				<p class="mt-2 text-sm text-red-400">{error}</p>
			{/if}
		</div>
	</div>
</section>

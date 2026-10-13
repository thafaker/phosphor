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

<section class="border-b border-line px-4 py-3">
	{#if inReplyTo}
		<p class="mb-2 text-sm text-ink-soft">
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
					class="mb-2 w-full rounded-md border border-warn/30 bg-inset px-3 py-1.5 text-sm text-warn placeholder-ink-faint outline-none focus:border-warn/60"
				/>
			{/if}

			<!-- svelte-ignore a11y_autofocus -->
			<textarea
				bind:value={text}
				{placeholder}
				{autofocus}
				rows={inReplyTo ? 2 : 3}
				onkeydown={onKeydown}
				class="w-full resize-none bg-transparent text-[0.95rem] leading-relaxed text-ink-strong placeholder-ink-faint outline-none"
			></textarea>

			<div class="mt-2 flex items-center gap-2">
				<button
					type="button"
					class="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-accent/10 {cwEnabled
						? 'text-warn'
						: 'text-ink-soft'}"
					onclick={() => (cwEnabled = !cwEnabled)}
					title="Inhaltswarnung"
				>
					<Icon name="alert" size={15} />
					CW
				</button>

				<label class="flex items-center gap-1 text-xs text-ink-soft">
					<Icon name="globe" size={15} />
					<select
						bind:value={visibility}
						class="cursor-pointer rounded-md bg-transparent py-1 pr-1 text-xs text-ink outline-none hover:bg-accent/10"
					>
						<option value="public">Öffentlich</option>
						<option value="unlisted">Nicht gelistet</option>
						<option value="private">Nur Follower</option>
						<option value="direct">Direkt</option>
					</select>
				</label>

				<span
					class="ml-auto text-xs tabular-nums {remaining < 0
						? 'text-danger'
						: remaining <= 200
							? 'text-warn'
							: 'text-ink-faint'}"
				>
					{remaining}
				</span>

				<button
					type="button"
					disabled={!canSubmit}
					onclick={submit}
					class="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-ink transition enabled:hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
				>
					<Icon name="send" size={15} />
					{submitting ? 'Sendet…' : 'Posten'}
				</button>
			</div>

			{#if error}
				<p class="mt-2 text-sm text-danger">{error}</p>
			{/if}
		</div>
	</div>
</section>

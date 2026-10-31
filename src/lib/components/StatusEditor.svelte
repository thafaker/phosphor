<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { editStatus, getStatusSource } from '#lib/api/gotosocial.ts';
	import type { Status } from '#lib/api/types.ts';
	import { session } from '#lib/auth/session.svelte.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { preferences } from '#lib/stores/preferences.svelte.ts';
	import { emojify } from '#lib/utils/text.ts';
	import Avatar from './Avatar.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		status: Status;
		onClose: () => void;
		onSaved: (status: Status) => void;
	}

	let { status, onClose, onSaved }: Props = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	// The raw values as loaded from the server, so we can tell whether anything
	// actually changed (GtS answers an unchanged edit with a 422).
	let originalText = '';
	let originalSpoiler = '';
	let originalMarkdown = false;

	let text = $state('');
	let spoilerText = $state('');
	let cwEnabled = $state(false);
	/** Seeded from the status' own format once the source is loaded. */
	let markdown = $state(false);
	// Seeded once from the status; the dialog is mounted per status.
	// svelte-ignore state_referenced_locally
	let sensitive = $state(status.sensitive);
	let loading = $state(true);
	let submitting = $state(false);
	let error = $state<string | null>(null);

	const hasMedia = $derived(status.media_attachments.length > 0);
	const nameHtml = $derived(
		emojify(status.account.display_name || status.account.username, status.account.emojis)
	);

	const remaining = $derived(session.maxChars - text.length - (cwEnabled ? spoilerText.length : 0));
	const dirty = $derived(
		text !== originalText ||
			(cwEnabled ? spoilerText : '') !== originalSpoiler ||
			markdown !== originalMarkdown ||
			sensitive !== status.sensitive
	);
	const canSubmit = $derived(
		(text.trim().length > 0 || hasMedia || status.poll !== null) &&
			remaining >= 0 &&
			!loading &&
			!submitting &&
			dirty &&
			!(cwEnabled && !spoilerText.trim())
	);
	const showEscapingHint = $derived(markdown && text.includes('\\'));

	// Open as a modal as soon as the element is in the DOM. Native <dialog>
	// gives us focus handling, Escape-to-close and a real backdrop for free.
	$effect(() => {
		const el = dialogEl;
		if (el && !el.open) el.showModal();
	});

	onMount(() => {
		let cancelled = false;
		void (async () => {
			try {
				const source = await getStatusSource(status.id);
				if (cancelled) return;
				text = source.text;
				spoilerText = source.spoiler_text;
				cwEnabled = source.spoiler_text.length > 0;
				originalText = source.text;
				originalSpoiler = source.spoiler_text;
				markdown = source.content_type
					? source.content_type === 'text/markdown'
					: preferences.markdown === 'on' ||
						(preferences.markdown === 'auto' &&
							session.account?.source?.status_content_type === 'text/markdown');
				originalMarkdown = markdown;
			} catch (err) {
				if (!cancelled) {
					error = err instanceof Error ? err.message : t('editor.loadFailed');
				}
			} finally {
				if (!cancelled) {
					loading = false;
					textareaEl?.focus();
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	async function submit(): Promise<void> {
		if (!canSubmit) return;
		submitting = true;
		error = null;
		try {
			const updated = await editStatus(status.id, {
				status: text,
				spoilerText: cwEnabled ? spoilerText : '',
				sensitive,
				// Omitting any of these would not "keep the current value" on the
				// server: GtS would clear the CW/sensitive flag, reset the language
				// to the account default and drop attachments or the poll.
				language: status.language ?? undefined,
				mediaIds: hasMedia ? status.media_attachments.map((item) => item.id) : undefined,
				poll: status.poll
					? {
							options: status.poll.options.map((option) => option.title),
							multiple: status.poll.multiple
						}
					: undefined,
				contentType: markdown ? 'text/markdown' : 'text/plain'
			});
			onSaved(updated);
			dialogEl?.close();
		} catch (err) {
			error = err instanceof Error ? err.message : t('editor.saveFailed');
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

	async function insertEmoji(shortcode: string): Promise<void> {
		const token = `:${shortcode}: `;
		const element = textareaEl;
		if (!element) {
			text += token;
			return;
		}
		const start = element.selectionStart ?? text.length;
		const end = element.selectionEnd ?? start;
		text = text.slice(0, start) + token + text.slice(end);
		await tick();
		element.focus();
		const caret = start + token.length;
		element.setSelectionRange(caret, caret);
	}
</script>

<dialog
	bind:this={dialogEl}
	onclose={onClose}
	onclick={(event) => {
		// A click on the backdrop targets the dialog element itself.
		if (event.target === dialogEl) dialogEl?.close();
	}}
	data-no-open
	aria-labelledby="edit-status-title"
	class="m-auto max-h-[85dvh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-line bg-surface p-0 text-ink shadow-glow backdrop:bg-scrim backdrop:backdrop-blur-sm"
>
	<div class="flex flex-col gap-3 p-4">
		<header class="flex items-center gap-3">
			<Avatar src={status.account.avatar_static} alt={status.account.username} size={36} />
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-semibold text-ink-strong">{@html nameHtml}</p>
				<p id="edit-status-title" class="text-xs text-ink-faint">{t('editor.title')}</p>
			</div>
			<button
				type="button"
				aria-label={t('common.close')}
				class="rounded-md p-1 text-ink-soft hover:bg-accent/10 hover:text-ink-strong"
				onclick={() => dialogEl?.close()}
			>
				<Icon name="close" size={18} />
			</button>
		</header>

		{#if loading}
			<div class="flex justify-center py-8 text-ink-soft">
				<Icon name="refresh" size={22} class="animate-spin" />
			</div>
		{:else}
			{#if cwEnabled}
				<input
					type="text"
					bind:value={spoilerText}
					placeholder={t('composer.cwPlaceholder')}
					class="w-full rounded-md border border-warn/30 bg-inset px-3 py-1.5 text-sm text-warn placeholder-ink-faint outline-none focus:border-warn/60"
				/>
			{/if}

			<textarea
				bind:this={textareaEl}
				bind:value={text}
				rows={5}
				onkeydown={onKeydown}
				class="w-full resize-y rounded-md border border-line bg-inset px-3 py-2 text-post leading-relaxed text-ink-strong placeholder-ink-faint outline-none focus:border-accent/60"
				placeholder={t('composer.placeholder')}></textarea>

			{#if showEscapingHint}
				<p class="text-xs text-ink-faint">
					{t('composer.escapeBefore')} <code class="rounded bg-inset px-1">\</code>
					{t('composer.escapeMiddle')} <code class="rounded bg-inset px-1">\\</code>
					{t('composer.escapeAfter')}
				</p>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					class="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-accent/10 {cwEnabled
						? 'text-warn'
						: 'text-ink-soft'}"
					onclick={() => (cwEnabled = !cwEnabled)}
					title={t('composer.cwTitle')}
				>
					<Icon name="alert" size={15} />
					CW
				</button>

				<button
					type="button"
					class="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-accent/10 {markdown
						? 'text-accent'
						: 'text-ink-soft'}"
					onclick={() => (markdown = !markdown)}
					title={t(markdown ? 'composer.markdownDisable' : 'composer.markdownEnable')}
					aria-pressed={markdown}
				>
					<span class="font-mono text-[11px] font-bold">MD</span>
				</button>

				<EmojiPicker disabled={submitting} onPick={(shortcode) => void insertEmoji(shortcode)} />

				{#if hasMedia}
					<button
						type="button"
						class="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-accent/10 {sensitive
							? 'text-warn'
							: 'text-ink-soft'}"
						onclick={() => (sensitive = !sensitive)}
						title={t('composer.sensitiveTitle')}
					>
						<Icon name="image" size={15} />
						{t('common.sensitive')}
					</button>
				{/if}

				<span
					class="ml-auto text-xs {remaining < 0 ? 'text-danger' : 'text-ink-faint'}"
					aria-label={t('editor.remaining')}
				>
					{remaining}
				</span>
			</div>

			{#if error}
				<p class="text-sm text-danger">{error}</p>
			{/if}

			<div class="flex justify-end gap-2">
				<button
					type="button"
					class="rounded-full px-3.5 py-1.5 text-sm text-ink-soft hover:bg-accent/10 hover:text-ink-strong"
					onclick={() => dialogEl?.close()}
				>
					{t('common.cancel')}
				</button>
				<button
					type="button"
					class="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-accent-ink transition enabled:hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
					disabled={!canSubmit}
					onclick={() => void submit()}
				>
					<Icon name="check" size={15} />
					{submitting ? t('editor.saving') : t('editor.save')}
				</button>
			</div>
		{/if}
	</div>
</dialog>

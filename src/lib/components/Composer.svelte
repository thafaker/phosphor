<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { postStatus, uploadMedia } from '#lib/api/gotosocial.ts';
	import type { Status, Visibility } from '#lib/api/types.ts';
	import { session } from '#lib/auth/session.svelte.ts';
	import { preferences } from '#lib/stores/preferences.svelte.ts';
	import { compressImage } from '#lib/utils/image.ts';
	import {
		createMediaDraft,
		revokeMediaDraft,
		validateMediaFile,
		type MediaDraft
	} from '#lib/utils/media.ts';
	import { replyMention } from '#lib/utils/account.ts';
	import { emojify } from '#lib/utils/text.ts';
	import Avatar from './Avatar.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import Icon from './Icon.svelte';
	import MediaPicker from './MediaPicker.svelte';

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
	/**
	 * Markdown mode. Seeded once from the account's server-side default, since
	 * that is what determines how the server would parse a post if we stayed
	 * silent. The toggle makes it explicit and remembers the choice.
	 */
	let markdown = $state(
		preferences.markdown === 'on' ||
			(preferences.markdown === 'auto' &&
				session.account?.source?.status_content_type === 'text/markdown')
	);
	// Default to the visibility of the status we're replying to (initial value only).
	// svelte-ignore state_referenced_locally
	let visibility = $state<Visibility>(inReplyTo?.visibility ?? 'public');
	let sensitive = $state(false);
	let drafts = $state<MediaDraft[]>([]);
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	const remaining = $derived(session.maxChars - text.length);
	const uploading = $derived(drafts.some((draft) => draft.uploading));
	const preparing = $derived(drafts.some((draft) => draft.preparing));
	const hasInvalid = $derived(drafts.some((draft) => draft.invalid));
	/** Markdown eats backslashes as escapes; point that out only when relevant. */
	const showEscapingHint = $derived(markdown && text.includes('\\'));
	const canSubmit = $derived(
		(text.trim().length > 0 || drafts.length > 0) &&
			remaining >= 0 &&
			!submitting &&
			!preparing &&
			!hasInvalid &&
			!(cwEnabled && !spoilerText.trim())
	);
	// Prefer the types the instance actually accepts; fall back to broad globs
	// so the picker is still usable if the instance doesn't advertise them.
	const accept = $derived(
		session.limits.supportedMediaTypes.length
			? session.limits.supportedMediaTypes.join(',')
			: 'image/*,video/*,audio/*'
	);

	const replyName = $derived(
		inReplyTo
			? emojify(
					inReplyTo.account.display_name || inReplyTo.account.username,
					inReplyTo.account.emojis
				)
			: ''
	);

	const replyHandle = $derived(inReplyTo ? replyMention(inReplyTo.account, session.account) : null);

	/** Reply target whose mention currently sits in the text, and which handle that was. */
	let seeded = { id: '', handle: '' };

	// Mastodon-style: the mention of the replied-to account is part of the text,
	// so it is visible, counted against the limit and editable like anything else.
	// GoToSocial notifies and addresses the other instance only from that text.
	$effect(() => {
		const id = inReplyTo?.id ?? '';
		if (id === seeded.id) return;

		const previous = seeded.handle;
		seeded = { id, handle: '' };
		if (!replyHandle) return;

		if (text.trim() === '') {
			text = `${replyHandle} `;
		} else if (previous && text.startsWith(`${previous} `)) {
			// A draft survives a change of target: keep the wording, re-address it.
			text = `${replyHandle} ${text.slice(previous.length + 1)}`;
		} else {
			return;
		}
		seeded = { id, handle: replyHandle };
	});

	function addFiles(files: FileList): void {
		error = null;
		const added: MediaDraft[] = [];
		for (const file of Array.from(files)) {
			if (drafts.length + added.length >= session.limits.maxMediaAttachments) {
				error = `Maximal ${session.limits.maxMediaAttachments} Anhänge pro Beitrag.`;
				break;
			}
			// Photos over the instance limit may still fit after compression; the
			// prepared file is validated again below.
			const problem = validateMediaFile(file, session.limits, { allowOversizeImages: true });
			if (problem) {
				error = problem;
				continue;
			}
			added.push(createMediaDraft(file));
		}
		if (!added.length) return;
		const firstNew = drafts.length;
		drafts = [...drafts, ...added];
		// Read the drafts back from the state array: Svelte wraps them in proxies,
		// and `prepareDraft` must mutate the same objects the UI renders.
		for (let index = firstNew; index < drafts.length; index += 1) {
			const draft = drafts[index];
			if (draft.type === 'image') void prepareDraft(draft);
		}
	}

	/**
	 * Resize/re-encode a photo before it is uploaded. The draft stays visible
	 * with a spinner; the ALT text remains editable while this runs. If the
	 * browser cannot decode the image, the original is kept and validated.
	 */
	async function prepareDraft(draft: MediaDraft): Promise<void> {
		draft.preparing = true;
		draft.error = null;
		draft.invalid = false;
		try {
			const result = await compressImage(draft.file, session.limits);
			if (!drafts.includes(draft)) return;

			if (result.compressed) {
				const oldPreview = draft.previewUrl;
				draft.file = result.file;
				draft.previewUrl = URL.createObjectURL(result.file);
				draft.originalSize = result.originalSize;
				URL.revokeObjectURL(oldPreview);
			}

			const problem = validateMediaFile(draft.file, session.limits);
			if (problem) {
				draft.error = problem;
				draft.invalid = true;
			}
		} catch {
			if (drafts.includes(draft)) {
				const problem = validateMediaFile(draft.file, session.limits);
				if (problem) {
					draft.error = problem;
					draft.invalid = true;
				}
			}
		} finally {
			draft.preparing = false;
		}
	}

	function removeDraft(draft: MediaDraft): void {
		revokeMediaDraft(draft);
		drafts = drafts.filter((item) => item !== draft);
	}

	function describeDraft(draft: MediaDraft, description: string): void {
		draft.description = description;
	}

	/**
	 * Upload everything not on the server yet. Attachments already uploaded
	 * during a failed attempt keep their id and are skipped, so retrying the
	 * post never duplicates media.
	 */
	async function uploadDrafts(): Promise<boolean> {
		if (drafts.some((draft) => draft.preparing || draft.invalid)) return false;
		const pending = drafts.filter((draft) => !draft.id);
		const results = await Promise.allSettled(
			pending.map(async (draft) => {
				draft.uploading = true;
				draft.error = null;
				try {
					const media = await uploadMedia({
						file: draft.file,
						description: draft.description.trim()
					});
					draft.id = media.id;
				} catch (err) {
					draft.error = err instanceof Error ? err.message : 'Upload fehlgeschlagen.';
					throw err;
				} finally {
					draft.uploading = false;
				}
			})
		);
		return results.every((result) => result.status === 'fulfilled');
	}

	function reset(): void {
		// The composer stays in reply mode after posting, so a follow-up answer
		// needs its mention just as much as the first one.
		text = replyHandle ? `${replyHandle} ` : '';
		spoilerText = '';
		cwEnabled = false;
		sensitive = false;
		drafts.forEach(revokeMediaDraft);
		drafts = [];
	}

	/**
	 * Flip the text format. An explicit choice is persisted so it survives a
	 * reload; `auto` (follow the account default) only applies until the first
	 * toggle.
	 */
	function toggleMarkdown(): void {
		markdown = !markdown;
		preferences.setMarkdown(markdown ? 'on' : 'off');
	}

	async function submit() {
		if (!canSubmit) return;
		submitting = true;
		error = null;
		try {
			if (!(await uploadDrafts())) {
				error = 'Mindestens ein Anhang konnte nicht hochgeladen werden.';
				return;
			}
			const created = await postStatus({
				status: text,
				spoilerText: cwEnabled ? spoilerText : undefined,
				visibility,
				inReplyToId: inReplyTo?.id,
				sensitive,
				mediaIds: drafts.length ? drafts.map((draft) => draft.id!) : undefined,
				contentType: markdown ? 'text/markdown' : 'text/plain'
			});
			reset();
			onPosted?.(created);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Beitrag konnte nicht gesendet werden.';
		} finally {
			submitting = false;
		}
	}

	// Object URLs leak memory if the composer goes away with drafts staged.
	onDestroy(() => drafts.forEach(revokeMediaDraft));

	/**
	 * Insert a custom emoji shortcode at the caret (or replace the selection),
	 * then put the caret back after it. `tick` is needed because Svelte updates
	 * the textarea value only after the state change renders.
	 */
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
				bind:this={textareaEl}
				bind:value={text}
				{placeholder}
				{autofocus}
				rows={inReplyTo ? 2 : 3}
				onkeydown={onKeydown}
				class="w-full resize-none bg-transparent text-post leading-relaxed text-ink-strong placeholder-ink-faint outline-none"
			></textarea>

			{#if showEscapingHint}
				<p class="mt-1 text-xs text-ink-faint">
					Markdown ist aktiv: <code class="rounded bg-inset px-1">\</code> maskiert Sonderzeichen.
					Für einen sichtbaren Backslash <code class="rounded bg-inset px-1">\\</code> schreiben.
				</p>
			{/if}

			<MediaPicker
				{drafts}
				limit={session.limits.maxMediaAttachments}
				descriptionLimit={session.limits.descriptionLimit}
				{accept}
				disabled={submitting}
				onFiles={addFiles}
				onRemove={removeDraft}
				onDescribe={describeDraft}
			/>

			<div class="mt-2 flex flex-wrap items-center gap-2">
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

				<button
					type="button"
					class="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-accent/10 {markdown
						? 'text-accent'
						: 'text-ink-soft'}"
					onclick={toggleMarkdown}
					title="Markdown-Formatierung {markdown ? 'ausschalten' : 'einschalten'}"
					aria-pressed={markdown}
				>
					<span class="font-mono text-[11px] font-bold">MD</span>
				</button>

				<EmojiPicker disabled={submitting} onPick={(shortcode) => void insertEmoji(shortcode)} />

				{#if drafts.length}
					<button
						type="button"
						class="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-accent/10 {sensitive
							? 'text-warn'
							: 'text-ink-soft'}"
						onclick={() => (sensitive = !sensitive)}
						title="Medien als sensibel markieren"
					>
						<Icon name="eye" size={15} />
						Sensibel
					</button>
				{/if}

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
					{preparing
						? 'Bereitet vor…'
						: uploading
							? 'Lädt hoch…'
							: submitting
								? 'Sendet…'
								: 'Posten'}
				</button>
			</div>

			{#if error}
				<p class="mt-2 text-sm text-danger">{error}</p>
			{/if}
		</div>
	</div>
</section>

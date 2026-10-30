<script lang="ts">
	import type { MediaDraft } from '#lib/utils/media.ts';
	import { formatBytes } from '#lib/utils/media.ts';
	import Icon from './Icon.svelte';

	interface Props {
		drafts: MediaDraft[];
		/** Max attachments the instance accepts. */
		limit: number;
		/** Alt-text character limit. */
		descriptionLimit: number;
		/** Value for the file input's `accept` attribute. */
		accept: string;
		disabled?: boolean;
		onFiles: (files: FileList) => void;
		onRemove: (draft: MediaDraft) => void;
		onDescribe: (draft: MediaDraft, description: string) => void;
	}

	let {
		drafts,
		limit,
		descriptionLimit,
		accept,
		disabled = false,
		onFiles,
		onRemove,
		onDescribe
	}: Props = $props();

	let inputEl = $state<HTMLInputElement | null>(null);

	const full = $derived(drafts.length >= limit);

	function handleChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		if (input.files?.length) onFiles(input.files);
		// Reset so picking the same file again still fires `change`.
		input.value = '';
	}
</script>

{#if drafts.length}
	<ul class="mt-2 space-y-2">
		{#each drafts as draft (draft.localId)}
			<li class="flex gap-3 rounded-lg border border-line bg-inset p-2">
				<div class="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-canvas">
					{#if draft.type === 'video'}
						<video src={draft.previewUrl} class="h-full w-full object-cover" muted playsinline
						></video>
					{:else if draft.type === 'image'}
						<img src={draft.previewUrl} alt="" class="h-full w-full object-cover" />
					{:else}
						<div class="flex h-full w-full items-center justify-center text-ink-faint">
							<Icon name="image" size={22} />
						</div>
					{/if}
					{#if draft.uploading || draft.preparing}
						<div class="absolute inset-0 flex items-center justify-center bg-scrim/60">
							<Icon name="refresh" size={18} class="animate-spin text-ink-strong" />
						</div>
					{/if}
				</div>

				<div class="min-w-0 flex-1">
					<textarea
						value={draft.description}
						oninput={(event) =>
							onDescribe(draft, (event.currentTarget as HTMLTextAreaElement).value)}
						maxlength={descriptionLimit}
						rows={2}
						placeholder="Bildbeschreibung (ALT) – wichtig für Screenreader"
						aria-label="Bildbeschreibung"
						class="w-full resize-none rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink placeholder-ink-faint outline-none focus:border-accent/60"
					></textarea>
					{#if draft.preparing}
						<p class="mt-0.5 text-xs text-ink-faint">Wird komprimiert…</p>
					{:else if draft.originalSize && draft.originalSize > draft.file.size}
						<p class="mt-0.5 text-xs text-ink-faint">
							{formatBytes(draft.originalSize)} → {formatBytes(draft.file.size)}
						</p>
					{/if}
					{#if draft.error}
						<p class="mt-0.5 text-xs text-danger">{draft.error}</p>
					{/if}
				</div>

				<button
					type="button"
					title="Anhang entfernen"
					aria-label="Anhang entfernen"
					{disabled}
					class="self-start rounded-md p-1 text-ink-soft hover:bg-accent/10 hover:text-danger disabled:opacity-40"
					onclick={() => onRemove(draft)}
				>
					<Icon name="close" size={16} />
				</button>
			</li>
		{/each}
	</ul>
{/if}

<div class="mt-2">
	<input bind:this={inputEl} type="file" multiple {accept} class="hidden" onchange={handleChange} />
	<button
		type="button"
		disabled={disabled || full}
		title={full ? `Maximal ${limit} Anhänge` : 'Bild, Video oder Audio anhängen'}
		class="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-soft hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
		onclick={() => inputEl?.click()}
	>
		<Icon name="image" size={15} />
		Anhang
		{#if drafts.length}
			<span class="tabular-nums">({drafts.length}/{limit})</span>
		{/if}
	</button>
</div>

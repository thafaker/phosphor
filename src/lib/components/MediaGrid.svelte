<script lang="ts">
	import { tick } from 'svelte';
	import type { MediaAttachment } from '#lib/api/types.ts';
	import Icon from './Icon.svelte';
	import MediaLightbox from './MediaLightbox.svelte';

	interface Props {
		attachments: MediaAttachment[];
		sensitive?: boolean;
	}

	let { attachments, sensitive = false }: Props = $props();

	// The reveal state is deliberately seeded from the initial `sensitive` prop.
	// svelte-ignore state_referenced_locally
	let revealed = $state(!sensitive);

	const isSingle = $derived(attachments.length === 1);

	let lightboxIndex = $state(-1);
	/** The control that opened the lightbox; focus returns there on close. */
	let trigger: HTMLButtonElement | undefined;

	function openLightbox(index: number, event: MouseEvent): void {
		trigger = event.currentTarget as HTMLButtonElement;
		lightboxIndex = index;
	}

	async function closeLightbox(): Promise<void> {
		lightboxIndex = -1;
		await tick();
		trigger?.focus();
		trigger = undefined;
	}
</script>

{#if attachments.length}
	<div class="relative mt-3">
		<div class={isSingle ? 'grid grid-cols-1' : 'grid grid-cols-2 gap-1'}>
			{#each attachments as attachment, index (attachment.id)}
				{#if attachment.type === 'image'}
					<button
						type="button"
						class="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg bg-inset ring-1 ring-line focus-visible:ring-2 focus-visible:ring-accent"
						aria-label={attachment.description
							? `Bild öffnen: ${attachment.description}`
							: `Bild ${index + 1} von ${attachments.length} öffnen`}
						onclick={(event) => openLightbox(index, event)}
					>
						<img
							src={attachment.preview_url}
							alt={attachment.description ?? ''}
							loading="lazy"
							referrerpolicy="no-referrer"
							class={isSingle ? 'max-h-[28rem] w-full object-cover' : 'h-44 w-full object-cover'}
						/>
						{#if attachment.description}
							<span
								class="absolute bottom-1.5 left-1.5 rounded bg-scrim px-1.5 py-0.5 text-[calc(10px*var(--text-scale))] font-semibold tracking-wide text-ink"
							>
								ALT
							</span>
						{/if}
					</button>
				{:else if attachment.type === 'video' || attachment.type === 'gifv'}
					<div class="relative">
						<video
							src={attachment.url}
							poster={attachment.preview_url}
							controls
							loop={attachment.type === 'gifv'}
							muted={attachment.type === 'gifv'}
							playsinline
							class={isSingle
								? 'max-h-[28rem] w-full rounded-lg bg-inset object-cover'
								: 'h-44 w-full rounded-lg bg-inset object-cover'}
						></video>
						<button
							type="button"
							class="absolute top-2 right-2 z-10 rounded-full bg-scrim/80 p-1.5 text-ink transition hover:bg-accent/20"
							aria-label="Video in Medienansicht öffnen"
							onclick={(event) => openLightbox(index, event)}
						>
							<Icon name="expand" size={16} />
						</button>
					</div>
				{:else if attachment.type === 'audio'}
					<div class="flex flex-col gap-2 rounded-lg bg-inset p-3 ring-1 ring-line">
						<div class="flex items-center gap-2 text-xs text-ink-soft">
							<Icon name="volume" size={16} />
							Audio
						</div>
						<audio src={attachment.url} controls class="w-full"></audio>
						{#if attachment.description}
							<p class="text-xs whitespace-pre-line text-ink-faint">{attachment.description}</p>
						{/if}
					</div>
				{:else}
					<a
						href={attachment.url}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-2 rounded-lg bg-inset p-3 text-sm text-ink-soft ring-1 ring-line"
					>
						<Icon name="image" size={18} />
						{attachment.remote_url ?? attachment.url}
					</a>
				{/if}
			{/each}
		</div>

		{#if sensitive && !revealed}
			<button
				type="button"
				class="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-lg bg-scrim text-sm font-medium text-ink backdrop-blur-sm"
				onclick={() => (revealed = true)}
			>
				<Icon name="alert" size={18} />
				Sensible Inhalte anzeigen
			</button>
		{/if}
	</div>

	{#if lightboxIndex >= 0}
		<MediaLightbox {attachments} startIndex={lightboxIndex} onClose={() => void closeLightbox()} />
	{/if}
{/if}

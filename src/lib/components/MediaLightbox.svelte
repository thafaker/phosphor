<script lang="ts">
	import type { MediaAttachment } from '#lib/api/types.ts';
	import Icon from './Icon.svelte';

	interface Props {
		attachments: MediaAttachment[];
		startIndex: number;
		onClose: () => void;
	}

	let { attachments, startIndex, onClose }: Props = $props();

	// The component is mounted per open; only the initial position matters.
	// svelte-ignore state_referenced_locally
	let index = $state(startIndex);
	let closeButton: HTMLButtonElement | undefined = $state();
	let dialog: HTMLDivElement | undefined = $state();

	const current = $derived(attachments[index]);
	const description = $derived(current?.description ?? '');

	$effect(() => {
		closeButton?.focus();
	});

	// The lightbox owns the viewport: no background scrolling while it is open.
	$effect(() => {
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});

	function previous(): void {
		if (index > 0) index -= 1;
	}

	function next(): void {
		if (index < attachments.length - 1) index += 1;
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			onClose();
			return;
		}
		if (event.key === 'Tab' && dialog) {
			const focusable = [
				...dialog.querySelectorAll<HTMLElement>(
					'button:not([disabled]):not([tabindex="-1"]), a[href], video[controls], audio[controls]'
				)
			];
			const first = focusable[0];
			const last = focusable.at(-1);
			if (!first || !last) return;
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
			return;
		}
		// Arrow keys belong to the media controls when one of them has focus.
		const target = event.target;
		if (target instanceof Element && target.closest('video, audio')) return;
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			previous();
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			next();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if current}
	<div
		bind:this={dialog}
		class="fixed inset-0 z-50 flex flex-col overflow-hidden bg-scrim/95 p-3 text-ink backdrop-blur-sm sm:p-6"
		role="dialog"
		aria-modal="true"
		aria-label="Medienansicht"
	>
		<!-- Mouse-only backdrop; Escape and the visible close button are accessible. -->
		<button
			type="button"
			tabindex="-1"
			aria-hidden="true"
			class="absolute inset-0 cursor-default"
			onclick={onClose}
		></button>

		<div class="relative z-10 flex items-center justify-between gap-3">
			<span class="text-sm text-ink-soft" aria-live="polite"
				>{index + 1} / {attachments.length}</span
			>
			<button
				bind:this={closeButton}
				type="button"
				class="rounded-full p-2 text-ink-soft transition hover:bg-accent/10 hover:text-ink-strong"
				aria-label="Medienansicht schließen"
				onclick={onClose}
			>
				<Icon name="close" size={22} />
			</button>
		</div>

		<div class="relative z-10 flex min-h-0 flex-1 items-center justify-center gap-2 sm:gap-4">
			{#if attachments.length > 1}
				<button
					type="button"
					class="shrink-0 rounded-full border border-line bg-surface/90 p-2 text-ink-soft transition hover:bg-accent/10 hover:text-ink-strong disabled:opacity-30"
					disabled={index === 0}
					aria-label="Vorheriges Medium"
					onclick={previous}
				>
					<Icon name="chevron-left" size={24} />
				</button>
			{/if}

			<div class="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3">
				{#if current.type === 'image'}
					<img
						src={current.url}
						alt={current.description ?? 'Bild'}
						class="max-h-[74dvh] max-w-full rounded-lg object-contain shadow-glow"
					/>
				{:else if current.type === 'video' || current.type === 'gifv'}
					<video
						src={current.url}
						poster={current.preview_url}
						controls
						loop={current.type === 'gifv'}
						muted={current.type === 'gifv'}
						playsinline
						class="max-h-[74dvh] max-w-full rounded-lg bg-black shadow-glow"
					></video>
				{:else if current.type === 'audio'}
					<div
						class="flex w-[min(90vw,34rem)] flex-col items-center gap-4 rounded-xl border border-line bg-surface/95 p-6"
					>
						<Icon name="volume" size={36} class="text-accent" />
						<audio src={current.url} controls class="w-full"></audio>
					</div>
				{:else}
					<a
						href={current.url}
						target="_blank"
						rel="noopener noreferrer"
						class="flex max-w-full items-center gap-2 rounded-lg border border-line bg-surface/95 p-4 text-sm text-accent underline"
					>
						<Icon name="image" size={18} />
						{current.remote_url ?? current.url}
					</a>
				{/if}

				{#if description}
					<p
						class="max-h-24 max-w-3xl overflow-y-auto rounded-md bg-surface/80 px-3 py-1.5 text-center text-sm whitespace-pre-line text-ink-soft"
					>
						{description}
					</p>
				{/if}
			</div>

			{#if attachments.length > 1}
				<button
					type="button"
					class="shrink-0 rounded-full border border-line bg-surface/90 p-2 text-ink-soft transition hover:bg-accent/10 hover:text-ink-strong disabled:opacity-30"
					disabled={index === attachments.length - 1}
					aria-label="Nächstes Medium"
					onclick={next}
				>
					<Icon name="chevron-right" size={24} />
				</button>
			{/if}
		</div>

		<div class="relative z-10 flex justify-center pt-2">
			<a
				href={current.url}
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-1.5 text-xs text-ink-faint transition hover:text-ink-strong"
			>
				Original öffnen
				<Icon name="link-out" size={13} />
			</a>
		</div>
	</div>
{/if}

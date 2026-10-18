<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		title: string;
		body?: string;
		confirmLabel?: string;
		/** Shows a destructive icon and tint. */
		danger?: boolean;
		/** Called on confirm; a thrown error is shown inside the dialog. */
		onConfirm: () => void | Promise<void>;
		onClose: () => void;
	}

	let {
		title,
		body = '',
		confirmLabel = 'Bestätigen',
		danger = false,
		onConfirm,
		onClose
	}: Props = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	// Native <dialog> as a modal once mounted: focus trap, Escape and the
	// backdrop come for free (same approach as the status editor).
	$effect(() => {
		const el = dialogEl;
		if (el && !el.open) el.showModal();
	});

	async function confirm(): Promise<void> {
		if (busy) return;
		busy = true;
		error = null;
		try {
			await onConfirm();
			dialogEl?.close();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Aktion fehlgeschlagen.';
		} finally {
			busy = false;
		}
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
	aria-label={title}
	class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-glow backdrop:bg-scrim backdrop:backdrop-blur-sm"
>
	<div class="flex flex-col gap-4 p-4">
		<div class="flex items-start gap-3">
			{#if danger}
				<span class="rounded-full bg-danger/10 p-2 text-danger">
					<Icon name="alert" size={18} />
				</span>
			{/if}
			<div class="min-w-0">
				<h2 class="text-base font-semibold text-ink-strong">{title}</h2>
				{#if body}
					<p class="mt-1 text-sm text-ink-soft">{body}</p>
				{/if}
			</div>
		</div>

		{#if error}
			<p class="text-sm text-danger">{error}</p>
		{/if}

		<div class="flex justify-end gap-2">
			<button
				type="button"
				disabled={busy}
				class="rounded-full px-3.5 py-1.5 text-sm text-ink-soft hover:bg-accent/10 hover:text-ink-strong disabled:opacity-40"
				onclick={() => dialogEl?.close()}
			>
				Abbrechen
			</button>
			<button
				type="button"
				disabled={busy}
				class="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 {danger
					? 'border border-danger/50 bg-danger/10 text-danger enabled:hover:bg-danger/20'
					: 'bg-accent text-accent-ink enabled:hover:bg-accent/90'}"
				onclick={() => void confirm()}
			>
				{busy ? '…' : confirmLabel}
			</button>
		</div>
	</div>
</dialog>

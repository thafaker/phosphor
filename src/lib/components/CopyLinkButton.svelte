<script lang="ts">
	import { onDestroy } from 'svelte';
	import { copyToClipboard } from '#lib/utils/clipboard.ts';
	import Icon from './Icon.svelte';

	interface Props {
		url: string;
		/** Visible label in the idle state. */
		label?: string;
		copiedLabel?: string;
		/** Tooltip and accessible name; defaults to `label`. */
		title?: string;
		class?: string;
	}

	let {
		url,
		label = 'Link kopieren',
		copiedLabel = 'Kopiert',
		title,
		class: className = ''
	}: Props = $props();

	let state = $state<'idle' | 'copied' | 'error'>('idle');
	let timer: ReturnType<typeof setTimeout> | null = null;

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});

	async function copy(): Promise<void> {
		const ok = await copyToClipboard(url);
		state = ok ? 'copied' : 'error';
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => (state = 'idle'), 2000);
	}

	const text = $derived(
		state === 'copied' ? copiedLabel : state === 'error' ? 'Kopieren fehlgeschlagen' : label
	);
</script>

<button
	type="button"
	class="inline-flex items-center gap-1.5 rounded-md text-xs transition hover:bg-accent/10 {className}"
	title={title ?? label}
	aria-label={title ?? label}
	onclick={copy}
>
	<Icon name={state === 'copied' ? 'check' : 'link'} size={14} />
	<span aria-live="polite">{text}</span>
</button>

<script lang="ts">
	import { onDestroy } from 'svelte';
	import { t } from '#lib/i18n/index.svelte.ts';
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

	let { url, label, copiedLabel, title, class: className = '' }: Props = $props();

	const idleLabel = $derived(label ?? t('common.copyLink'));
	const doneLabel = $derived(copiedLabel ?? t('common.copied'));

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
		state === 'copied' ? doneLabel : state === 'error' ? t('common.copyFailed') : idleLabel
	);
</script>

<button
	type="button"
	class="inline-flex items-center gap-1.5 rounded-md text-xs transition hover:bg-accent/10 {className}"
	title={title ?? idleLabel}
	aria-label={title ?? idleLabel}
	onclick={copy}
>
	<Icon name={state === 'copied' ? 'check' : 'link'} size={14} />
	<span aria-live="polite">{text}</span>
</button>

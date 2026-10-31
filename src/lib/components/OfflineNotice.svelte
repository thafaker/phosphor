<script lang="ts">
	import Icon from './Icon.svelte';
	import { t } from '#lib/i18n/index.svelte.ts';

	interface Props {
		/** Called by the retry button; omit it for a read-only notice. */
		onRetry?: () => void;
	}

	let { onRetry }: Props = $props();
</script>

<div
	class="m-4 flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-3 text-sm text-ink-soft"
	role="status"
>
	<Icon name="alert" size={18} class="shrink-0 text-accent" />
	<span class="flex-1">{t('offline.stale')}</span>
	{#if onRetry}
		<button
			type="button"
			class="rounded-md border border-line px-2 py-1 text-xs transition hover:bg-accent/10 hover:text-ink-strong"
			onclick={onRetry}
		>
			{t('common.retry')}
		</button>
	{/if}
</div>

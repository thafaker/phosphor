<script lang="ts">
	import type { Status } from '#lib/api/types.ts';
	import { emojify } from '#lib/utils/text.ts';
	import Icon from './Icon.svelte';
	import StatusBody from './StatusBody.svelte';

	interface Props {
		status: Status;
		detail?: boolean;
		/** Forwarded to StatusBody so a host view can drop a deleted post. */
		onDeleted?: (id: string) => void;
	}

	let { status, detail = false, onDeleted }: Props = $props();

	const effective = $derived(status.reblog ?? status);
	const booster = $derived(status.reblog ? status.account : null);
	const boosterName = $derived(
		booster ? emojify(booster.display_name || booster.username, booster.emojis) : ''
	);
</script>

<article class="border-b border-line transition-colors hover:bg-accent/5">
	{#if booster}
		<div class="flex items-center gap-2 px-4 pt-3 text-xs text-ink-soft">
			<Icon name="boost" size={14} />
			<a href={booster.url} target="_blank" rel="noopener noreferrer" class="hover:underline">
				{@html boosterName}
			</a>
			hat geboostet
		</div>
	{/if}
	<StatusBody status={effective} {detail} {onDeleted} />
</article>

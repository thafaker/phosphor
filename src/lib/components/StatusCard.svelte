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
		/**
		 * Opens an inline composer for this post. Receives the *effective*
		 * status, so replying to a boost replies to its original.
		 */
		onReply?: (status: Status) => void;
	}

	let { status, detail = false, onDeleted, onReply }: Props = $props();

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
			<a href={`/accounts/${booster.id}`} class="hover:underline">
				{@html boosterName}
			</a>
			hat geboostet
		</div>
	{/if}
	<StatusBody
		status={effective}
		{detail}
		{onDeleted}
		onReply={onReply ? () => onReply(effective) : undefined}
	/>
</article>

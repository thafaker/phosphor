<script lang="ts">
	import type { Status } from '#lib/api/types.ts';
	import { emojify } from '#lib/utils/text.ts';
	import Composer from './Composer.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		/** The status being replied to. */
		status: Status;
		/** Collapse the box again (also runs right after a successful post). */
		onClose: () => void;
		/** Receives the freshly created reply, e.g. to file it into the thread. */
		onPosted?: (created: Status) => void;
	}

	let { status, onClose, onPosted }: Props = $props();

	const name = $derived(status.account.display_name || status.account.username);
	const handle = $derived(`@${status.account.acct}`);
</script>

<!-- Wraps the shared composer so replying from a list (timeline or thread)
     happens in place instead of navigating away. The mention handling lives in
     the composer itself; this only adds context and a way back out. -->
<section class="border-b border-line bg-accent/5" data-no-open>
	<div class="flex items-center gap-2 px-4 pt-3 text-xs text-ink-soft">
		<Icon name="reply" size={14} class="shrink-0 text-accent" />
		<span class="min-w-0 flex-1 truncate">
			Antwort an <strong class="font-semibold text-ink-strong"
				>{@html emojify(name, status.account.emojis)}</strong
			>
			<span class="text-ink-faint">{handle}</span>
		</span>
		<button
			type="button"
			class="shrink-0 rounded-md p-1 text-ink-faint hover:bg-accent/10 hover:text-ink-strong"
			title="Antwort zuklappen"
			aria-label="Antwort zuklappen"
			onclick={onClose}
		>
			<Icon name="close" size={16} />
		</button>
	</div>

	<Composer
		inReplyTo={status}
		placeholder="Antwort schreiben…"
		autofocus
		onPosted={(created) => {
			onPosted?.(created);
			onClose();
		}}
	/>
</section>

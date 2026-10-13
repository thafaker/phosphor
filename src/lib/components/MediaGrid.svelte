<script lang="ts">
	import type { MediaAttachment } from '#lib/api/types.ts';
	import Icon from './Icon.svelte';

	interface Props {
		attachments: MediaAttachment[];
		sensitive?: boolean;
	}

	let { attachments, sensitive = false }: Props = $props();

	// The reveal state is deliberately seeded from the initial `sensitive` prop.
	// svelte-ignore state_referenced_locally
	let revealed = $state(!sensitive);

	const isSingle = $derived(attachments.length === 1);
</script>

{#if attachments.length}
	<div class="relative mt-3">
		<div class={isSingle ? 'grid grid-cols-1' : 'grid grid-cols-2 gap-1'}>
			{#each attachments as attachment (attachment.id)}
				{#if attachment.type === 'image' || attachment.type === 'unknown'}
					<a
						href={attachment.url}
						target="_blank"
						rel="noopener noreferrer"
						class="group relative block overflow-hidden rounded-lg bg-inset ring-1 ring-line"
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
					</a>
				{:else if attachment.type === 'video' || attachment.type === 'gifv'}
					<video
						src={attachment.url}
						controls
						loop
						muted
						playsinline
						class={isSingle
							? 'max-h-[28rem] w-full rounded-lg bg-inset object-cover'
							: 'h-44 w-full rounded-lg bg-inset object-cover'}
					></video>
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
{/if}

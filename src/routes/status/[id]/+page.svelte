<script lang="ts">
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import Composer from '#lib/components/Composer.svelte';
	import StatusCard from '#lib/components/StatusCard.svelte';
	import { getContext, getStatus } from '#lib/api/gotosocial.ts';
	import type { Status } from '#lib/api/types.ts';

	let status = $state<Status | null>(null);
	let ancestors = $state<Status[]>([]);
	let descendants = $state<Status[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function load(id: string): Promise<void> {
		loading = true;
		error = null;
		try {
			const [main, context] = await Promise.all([getStatus(id), getContext(id)]);
			status = main;
			ancestors = context.ancestors;
			descendants = context.descendants;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Beitrag konnte nicht geladen werden.';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		const id = page.params.id;
		if (id) void load(id);
	});

	function onPosted(created: Status): void {
		descendants = [...descendants, created];
	}
</script>

<header
	class="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur"
>
	<a
		href="/"
		class="rounded-md p-1 text-ink-soft hover:bg-accent/10 hover:text-ink-strong"
		aria-label="Zurück"
	>
		<Icon name="chevron-left" size={20} />
	</a>
	<h1 class="text-lg font-semibold tracking-tight text-ink-strong">Beitrag</h1>
</header>

{#if loading}
	<div class="flex justify-center py-12 text-ink-soft">
		<Icon name="refresh" size={24} class="animate-spin" />
	</div>
{:else if error}
	<div class="m-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
		{error}
	</div>
{:else if status}
	{#each ancestors as ancestor (ancestor.id)}
		<StatusCard status={ancestor} />
	{/each}

	<StatusCard {status} detail />

	<Composer inReplyTo={status} placeholder="Antwort schreiben…" {onPosted} />

	{#each descendants as descendant (descendant.id)}
		<StatusCard status={descendant} />
	{/each}
{/if}

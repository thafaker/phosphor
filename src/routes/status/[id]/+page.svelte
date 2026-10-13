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
	class="sticky top-0 z-20 flex items-center gap-3 border-b border-emerald-400/10 bg-[#07110b]/85 px-4 py-3 backdrop-blur"
>
	<a
		href="/"
		class="rounded-md p-1 text-emerald-300/60 hover:bg-emerald-400/10 hover:text-emerald-200"
		aria-label="Zurück"
	>
		<Icon name="chevron-left" size={20} />
	</a>
	<h1 class="text-lg font-semibold tracking-tight text-emerald-50">Beitrag</h1>
</header>

{#if loading}
	<div class="flex justify-center py-12 text-emerald-400/50">
		<Icon name="refresh" size={24} class="animate-spin" />
	</div>
{:else if error}
	<div class="m-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
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

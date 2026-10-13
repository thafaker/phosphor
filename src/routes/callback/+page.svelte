<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { session } from '#lib/auth/session.svelte.ts';

	let errorMessage = $state<string | null>(null);

	onMount(async () => {
		const params = page.url.searchParams;
		const error = params.get('error');
		if (error) {
			errorMessage = params.get('error_description') ?? error;
			return;
		}

		const code = params.get('code');
		if (!code) {
			errorMessage = 'Kein Autorisierungscode erhalten.';
			return;
		}

		try {
			await session.finishLogin(code, params.get('state'));
			await goto('/');
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Login fehlgeschlagen.';
		}
	});
</script>

<div class="flex min-h-dvh items-center justify-center px-4 text-center">
	{#if errorMessage}
		<div class="max-w-sm rounded-2xl border border-danger/30 bg-danger/10 p-6">
			<Icon name="alert" size={32} class="mx-auto text-danger" />
			<h1 class="mt-3 text-lg font-semibold text-danger">Anmeldung fehlgeschlagen</h1>
			<p class="mt-2 text-sm text-danger">{errorMessage}</p>
			<a
				href="/login"
				class="mt-4 inline-block rounded-full bg-danger/20 px-4 py-2 text-sm text-danger hover:bg-danger/30"
			>
				Zurück zum Login
			</a>
		</div>
	{:else}
		<div class="font-mono text-accent">
			<Icon name="refresh" size={24} class="mx-auto animate-spin" />
			<p class="mt-3 animate-pulse text-sm">Anmeldung wird abgeschlossen…</p>
		</div>
	{/if}
</div>

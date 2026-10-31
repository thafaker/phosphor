<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { session } from '#lib/auth/session.svelte.ts';
	import { t } from '#lib/i18n/index.svelte.ts';

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
			errorMessage = t('callback.noCode');
			return;
		}

		try {
			await session.finishLogin(code, params.get('state'));
			await goto('/');
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : t('callback.genericError');
		}
	});
</script>

<div class="flex min-h-dvh items-center justify-center px-4 text-center">
	{#if errorMessage}
		<div class="max-w-sm rounded-2xl border border-danger/30 bg-danger/10 p-6">
			<Icon name="alert" size={32} class="mx-auto text-danger" />
			<h1 class="mt-3 text-lg font-semibold text-danger">{t('callback.failedTitle')}</h1>
			<p class="mt-2 text-sm text-danger">{errorMessage}</p>
			<a
				href="/login"
				class="mt-4 inline-block rounded-full bg-danger/20 px-4 py-2 text-sm text-danger hover:bg-danger/30"
			>
				{t('callback.backToLogin')}
			</a>
		</div>
	{:else}
		<div class="font-mono text-accent">
			<Icon name="refresh" size={24} class="mx-auto animate-spin" />
			<p class="mt-3 animate-pulse text-sm">{t('callback.completing')}</p>
		</div>
	{/if}
</div>

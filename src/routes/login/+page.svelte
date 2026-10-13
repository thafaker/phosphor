<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { APP_NAME, INSTANCE_HOST } from '#lib/config.ts';
	import { session } from '#lib/auth/session.svelte.ts';

	function login() {
		void session.beginLogin();
	}
</script>

<div class="flex min-h-dvh items-center justify-center px-4">
	<div
		class="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-glow"
	>
		<Icon name="sparkles" size={40} class="mx-auto text-accent" />
		<h1 class="mt-3 text-2xl font-bold tracking-tight text-accent">{APP_NAME}</h1>
		<p class="mt-1 text-sm text-ink-soft">
			Ein schlankes Web-Frontend für
			<span class="text-ink">{INSTANCE_HOST}</span>.
		</p>

		<button
			type="button"
			onclick={login}
			class="mt-6 w-full rounded-full bg-accent px-4 py-2.5 font-semibold text-accent-ink transition hover:bg-accent/90"
		>
			Mit {INSTANCE_HOST} anmelden
		</button>

		{#if session.error}
			<p class="mt-3 text-sm text-danger">{session.error}</p>
		{/if}

		<p class="mt-4 text-xs leading-relaxed text-ink-faint">
			Du wirst zur Anmeldung deiner Instanz weitergeleitet und kehrst danach hierher zurück.
		</p>
	</div>
</div>

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
		class="w-full max-w-sm rounded-2xl border border-emerald-400/15 bg-[#0b1710] p-6 text-center shadow-[0_0_60px_rgba(16,185,129,0.08)]"
	>
		<Icon name="sparkles" size={40} class="mx-auto text-emerald-400" />
		<h1 class="mt-3 text-2xl font-bold tracking-tight text-emerald-300">{APP_NAME}</h1>
		<p class="mt-1 text-sm text-emerald-200/60">
			Ein schlankes Web-Frontend für
			<span class="text-emerald-200">{INSTANCE_HOST}</span>.
		</p>

		<button
			type="button"
			onclick={login}
			class="mt-6 w-full rounded-full bg-emerald-500/90 px-4 py-2.5 font-semibold text-emerald-950 transition hover:bg-emerald-400"
		>
			Mit {INSTANCE_HOST} anmelden
		</button>

		{#if session.error}
			<p class="mt-3 text-sm text-red-400">{session.error}</p>
		{/if}

		<p class="mt-4 text-xs leading-relaxed text-emerald-300/40">
			Du wirst zur Anmeldung deiner Instanz weitergeleitet und kehrst danach hierher zurück.
		</p>
	</div>
</div>

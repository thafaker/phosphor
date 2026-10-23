<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { APP_NAME, DEFAULT_INSTANCE_URL } from '#lib/config.ts';
	import { instance } from '#lib/instance.svelte.ts';
	import { session } from '#lib/auth/session.svelte.ts';
	import { instanceHost, normalizeInstanceUrl } from '#lib/utils/instance.ts';

	let input = $state(instance.url || DEFAULT_INSTANCE_URL || '');
	let localError = $state<string | null>(null);

	const host = $derived(instanceHost(normalizeInstanceUrl(input) ?? ''));

	function login(): void {
		localError = null;
		if (!instance.set(input)) {
			localError = 'Bitte eine gültige Instanz-URL angeben, z. B. social.example.org.';
			return;
		}
		void session.beginLogin();
	}
</script>

<div class="flex min-h-dvh items-center justify-center px-4">
	<div class="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-glow">
		<div class="text-center">
			<Icon name="sparkles" size={40} class="mx-auto text-accent" />
			<h1 class="mt-3 text-2xl font-bold tracking-tight text-accent">{APP_NAME}</h1>
			<p class="mt-1 text-sm text-ink-soft">Ein schlankes Web-Frontend für GoToSocial.</p>
		</div>

		<form class="mt-6" onsubmit={(event) => (event.preventDefault(), login())}>
			<label for="instance" class="text-xs font-medium tracking-wide text-ink-soft uppercase">
				Instanz
			</label>
			<input
				id="instance"
				bind:value={input}
				placeholder="social.example.org"
				autocomplete="url"
				autocapitalize="none"
				autocorrect="off"
				spellcheck="false"
				inputmode="url"
				class="mt-1 w-full rounded-md border border-line bg-inset px-3 py-2 text-sm text-ink-strong placeholder-ink-faint outline-none focus:border-accent/60"
			/>
			<p class="mt-1 text-xs leading-relaxed text-ink-faint">
				Die Adresse deiner GoToSocial-Instanz. Ohne <code>https://</code> wird HTTPS angenommen.
			</p>

			<button
				type="submit"
				class="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 font-semibold text-accent-ink transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
				disabled={!host}
			>
				{#if host}
					Mit {host} anmelden
				{:else}
					Instanz angeben
				{/if}
			</button>
		</form>

		{#if localError ?? session.error}
			<p class="mt-3 text-sm text-danger">{localError ?? session.error}</p>
		{/if}

		<p class="mt-4 text-xs leading-relaxed text-ink-faint">
			Du wirst zur Anmeldung deiner Instanz weitergeleitet und kehrst danach hierher zurück.
			Phosphor speichert nur die Instanz-Adresse und dein Token in diesem Browser.
		</p>
	</div>
</div>

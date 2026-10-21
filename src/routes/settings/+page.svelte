<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { session } from '#lib/auth/session.svelte.ts';
	import { pushStore } from '#lib/push/push.svelte.ts';
	import {
		preferences,
		TEXT_SCALES,
		type MotionPreference,
		type PullToRefreshPreference,
		type ThemePreference
	} from '#lib/stores/preferences.svelte.ts';

	const themes: { value: ThemePreference; label: string; icon: string }[] = [
		{ value: 'system', label: 'System', icon: 'refresh' },
		{ value: 'light', label: 'Hell', icon: 'sun' },
		{ value: 'dark', label: 'Dunkel', icon: 'moon' }
	];

	const motionOptions: { value: MotionPreference; label: string; hint: string }[] = [
		{ value: 'system', label: 'System', hint: 'Der Einstellung deines Geräts folgen' },
		{ value: 'reduce', label: 'Reduziert', hint: 'Animationen immer minimieren' }
	];

	const pullOptions: { value: PullToRefreshPreference; label: string; hint: string }[] = [
		{ value: 'auto', label: 'Automatisch', hint: 'Nur in der installierten App' },
		{ value: 'always', label: 'Immer', hint: 'Auch im Browser-Tab' },
		{ value: 'never', label: 'Aus', hint: 'Keine Geste' }
	];

	const percent = $derived(Math.round(preferences.textScale * 100));
	const scaleIndex = $derived((TEXT_SCALES as readonly number[]).indexOf(preferences.textScale));

	onMount(() => {
		pushStore.init();
		void pushStore.refresh();
	});

	function togglePush(): void {
		if (pushStore.enabled) void pushStore.disable();
		else void pushStore.enable();
	}
</script>

<header class="sticky top-0 z-20 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur">
	<h1 class="text-lg font-semibold tracking-tight text-ink-strong">Einstellungen</h1>
</header>

<section class="border-b border-line px-4 py-5">
	<h2 class="text-sm font-semibold text-ink-strong">Benachrichtigungen</h2>
	<p class="mt-1 text-sm text-ink-soft">
		Erhalte Meldungen (Erwähnungen, Favoriten, Boosts, neue Follower) auch dann, wenn Phosphor
		geschlossen ist.
	</p>

	{#if !pushStore.supported}
		<p class="mt-4 rounded-xl border border-line bg-surface-2 p-3 text-sm text-ink-soft">
			Dieser Browser unterstützt kein Web-Push. Auf dem iPhone funktioniert das nur in der zum
			Home-Bildschirm hinzugefügten App (iOS 16.4 oder neuer).
		</p>
	{:else}
		<div class="mt-4 flex items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-sm font-medium text-ink-strong">
					{pushStore.enabled ? 'Aktiviert' : 'Deaktiviert'}
				</p>
				<p class="text-xs text-ink-faint">
					{pushStore.enabled
						? 'Du bekommst Push-Meldungen dieser Instanz.'
						: 'Es werden keine Push-Meldungen gesendet.'}
				</p>
			</div>
			<button
				type="button"
				disabled={pushStore.busy}
				onclick={togglePush}
				aria-pressed={pushStore.enabled}
				class="shrink-0 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 {pushStore.enabled
					? 'border-line text-ink-soft hover:bg-accent/10'
					: 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20'}"
			>
				{pushStore.busy ? '…' : pushStore.enabled ? 'Deaktivieren' : 'Aktivieren'}
			</button>
		</div>

		{#if pushStore.error}
			<div class="mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3">
				<p class="text-sm text-warn">{pushStore.error}</p>
				{#if pushStore.needsRelogin}
					<button
						type="button"
						onclick={() => session.logout()}
						class="mt-2 rounded-lg border border-warn/40 px-3 py-1.5 text-xs font-medium text-warn transition hover:bg-warn/10"
					>
						Neu einloggen
					</button>
				{/if}
			</div>
		{/if}

		<p class="mt-3 text-xs text-ink-faint">
			Auf dem iPhone nur in der installierten App verfügbar (iOS 16.4+). Die Erlaubnis fragt iOS
			beim Aktivieren ab.
		</p>
	{/if}
</section>

<section class="border-b border-line px-4 py-5">
	<h2 class="text-sm font-semibold text-ink-strong">Erscheinungsbild</h2>
	<p class="mt-1 text-sm text-ink-soft">
		Farbschema für Phosphor. „System“ folgt der Einstellung deines Geräts.
	</p>

	<div class="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Farbschema">
		{#each themes as option (option.value)}
			<button
				type="button"
				aria-pressed={preferences.theme === option.value}
				onclick={() => preferences.setTheme(option.value)}
				class="flex flex-col items-center gap-1.5 rounded-xl border border-line px-3 py-3 text-sm transition hover:bg-accent/10 {preferences.theme ===
				option.value
					? 'border-accent/40 bg-accent/10 text-accent'
					: 'text-ink-soft'}"
			>
				<Icon name={option.icon} size={20} />
				<span>{option.label}</span>
			</button>
		{/each}
	</div>
</section>

<section class="border-b border-line px-4 py-5">
	<h2 class="text-sm font-semibold text-ink-strong">Neu laden per Wischen</h2>
	<p class="mt-1 text-sm text-ink-soft">
		Ziehe die Seite am oberen Rand nach unten, um Beiträge und Meldungen zu aktualisieren. Im
		Browser-Tab macht das normalerweise der Browser selbst — deshalb ist die Geste standardmäßig nur
		in der zum Home-Bildschirm hinzugefügten App aktiv.
	</p>

	<div class="mt-4 grid gap-2 sm:grid-cols-3" role="group" aria-label="Neu laden per Wischen">
		{#each pullOptions as option (option.value)}
			<button
				type="button"
				aria-pressed={preferences.pullToRefresh === option.value}
				onclick={() => preferences.setPullToRefresh(option.value)}
				class="rounded-xl border border-line px-3 py-3 text-left transition hover:bg-accent/10 {preferences.pullToRefresh ===
				option.value
					? 'border-accent/40 bg-accent/10'
					: ''}"
			>
				<span
					class="block text-sm font-medium {preferences.pullToRefresh === option.value
						? 'text-accent'
						: 'text-ink-strong'}">{option.label}</span
				>
				<span class="mt-0.5 block text-xs text-ink-soft">{option.hint}</span>
			</button>
		{/each}
	</div>

	{#if preferences.pullToRefreshEnabled}
		<p class="mt-3 text-xs text-ink-faint">
			Aktiv. Zusätzlich laden die Timelines und Meldungen beim Zurückkehren in die App automatisch
			nach.
		</p>
	{:else}
		<p class="mt-3 text-xs text-ink-faint">
			Aus. Aktualisiert wird weiterhin automatisch beim Zurückkehren in die App und live über den
			Stream.
		</p>
	{/if}
</section>

<section class="border-b border-line px-4 py-5">
	<h2 class="text-sm font-semibold text-ink-strong">Bewegung</h2>
	<p class="mt-1 text-sm text-ink-soft">
		Phosphor folgt standardmäßig der Systemeinstellung „Bewegung reduzieren“. Hier kannst du sie
		unabhängig davon erzwingen.
	</p>

	<div class="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Bewegung">
		{#each motionOptions as option (option.value)}
			<button
				type="button"
				aria-pressed={preferences.motion === option.value}
				onclick={() => preferences.setMotion(option.value)}
				class="rounded-xl border border-line px-3 py-3 text-left transition hover:bg-accent/10 {preferences.motion ===
				option.value
					? 'border-accent/40 bg-accent/10'
					: ''}"
			>
				<span
					class="block text-sm font-medium {preferences.motion === option.value
						? 'text-accent'
						: 'text-ink-strong'}">{option.label}</span
				>
				<span class="mt-0.5 block text-xs text-ink-soft">{option.hint}</span>
			</button>
		{/each}
	</div>
</section>

<section class="border-b border-line px-4 py-5">
	<h2 class="text-sm font-semibold text-ink-strong">Schriftgröße</h2>
	<p class="mt-1 text-sm text-ink-soft">
		Vergrößert Text und Bedienelemente der gesamten App. Die Auswahl wird gespeichert und bleibt
		auch nach dem Neuladen erhalten.
	</p>

	<div class="mt-4 flex items-center gap-3">
		<button
			type="button"
			onclick={() => preferences.decreaseText()}
			disabled={!preferences.canDecrease}
			aria-label="Schrift verkleinern"
			class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-line px-2 font-semibold text-ink-strong transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
		>
			A−
		</button>

		<div class="flex-1 text-center">
			<p class="text-2xl font-semibold text-ink-strong tabular-nums" aria-live="polite">
				{percent} %
			</p>
		</div>

		<button
			type="button"
			onclick={() => preferences.increaseText()}
			disabled={!preferences.canIncrease}
			aria-label="Schrift vergrößern"
			class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-line px-2 font-semibold text-ink-strong transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
		>
			A+
		</button>
	</div>

	<label class="mt-4 block">
		<span class="sr-only">Schriftgröße in Prozent</span>
		<input
			type="range"
			min="0"
			max={TEXT_SCALES.length - 1}
			step="1"
			value={scaleIndex}
			oninput={(event) => preferences.setTextScale(TEXT_SCALES[Number(event.currentTarget.value)])}
			class="w-full accent-accent"
		/>
	</label>

	<div class="mt-4 flex items-center justify-between gap-3">
		<p class="text-xs text-ink-faint">100 % – 200 %</p>
		{#if preferences.textScale !== 1}
			<button
				type="button"
				onclick={() => preferences.resetText()}
				class="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-accent/10"
			>
				Auf 100 % zurücksetzen
			</button>
		{/if}
	</div>

	<div class="mt-5 rounded-xl border border-line bg-surface-2 p-4">
		<p class="text-xs font-medium tracking-wide text-ink-faint uppercase">Vorschau</p>
		<p class="mt-2 text-ink">
			Phosphor rendert Beiträge, Benachrichtigungen und Bedienelemente in dieser Größe — damit lange
			Texte auch ohne Bildschirmzoom angenehm lesbar bleiben.
		</p>
	</div>
</section>

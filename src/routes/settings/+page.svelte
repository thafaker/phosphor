<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import {
		preferences,
		TEXT_SCALES,
		type ThemePreference
	} from '#lib/stores/preferences.svelte.ts';

	const themes: { value: ThemePreference; label: string; icon: string }[] = [
		{ value: 'system', label: 'System', icon: 'refresh' },
		{ value: 'light', label: 'Hell', icon: 'sun' },
		{ value: 'dark', label: 'Dunkel', icon: 'moon' }
	];

	const percent = $derived(Math.round(preferences.textScale * 100));
	const scaleIndex = $derived((TEXT_SCALES as readonly number[]).indexOf(preferences.textScale));
</script>

<header class="sticky top-0 z-20 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur">
	<h1 class="text-lg font-semibold tracking-tight text-ink-strong">Einstellungen</h1>
</header>

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
			class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line font-semibold text-ink-strong transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
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
			class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line font-semibold text-ink-strong transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
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

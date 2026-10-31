<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { session } from '#lib/auth/session.svelte.ts';
	import { LOCALES, i18n, t } from '#lib/i18n/index.svelte.ts';
	import { pushStore } from '#lib/push/push.svelte.ts';
	import {
		preferences,
		TEXT_SCALES,
		type MotionPreference,
		type PullToRefreshPreference,
		type ThemePreference
	} from '#lib/stores/preferences.svelte.ts';

	const themes: { value: ThemePreference; label: () => string; icon: string }[] = [
		{ value: 'system', label: () => t('settings.theme.system'), icon: 'refresh' },
		{ value: 'light', label: () => t('settings.theme.light'), icon: 'sun' },
		{ value: 'dark', label: () => t('settings.theme.dark'), icon: 'moon' }
	];

	const motionOptions: { value: MotionPreference; label: () => string; hint: () => string }[] = [
		{
			value: 'system',
			label: () => t('settings.motion.system'),
			hint: () => t('settings.motion.systemHint')
		},
		{
			value: 'reduce',
			label: () => t('settings.motion.reduce'),
			hint: () => t('settings.motion.reduceHint')
		}
	];

	const pullOptions: { value: PullToRefreshPreference; label: () => string; hint: () => string }[] =
		[
			{
				value: 'auto',
				label: () => t('settings.pull.auto'),
				hint: () => t('settings.pull.autoHint')
			},
			{
				value: 'always',
				label: () => t('settings.pull.always'),
				hint: () => t('settings.pull.alwaysHint')
			},
			{
				value: 'never',
				label: () => t('settings.pull.never'),
				hint: () => t('settings.pull.neverHint')
			}
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
	<h1 class="text-lg font-semibold tracking-tight text-ink-strong">{t('settings.title')}</h1>
</header>

<section class="border-b border-line px-4 py-5">
	<h2 class="text-sm font-semibold text-ink-strong">{t('settings.language.title')}</h2>
	<p class="mt-1 text-sm text-ink-soft">{t('settings.language.description')}</p>

	<div class="mt-4 grid grid-cols-2 gap-2" role="group" aria-label={t('settings.language.title')}>
		{#each LOCALES as locale (locale.value)}
			<button
				type="button"
				aria-pressed={i18n.locale === locale.value}
				onclick={() => i18n.setLocale(locale.value)}
				class="rounded-xl border px-3 py-3 text-sm font-medium transition {i18n.locale ===
				locale.value
					? 'border-accent/40 bg-accent/10 text-accent'
					: 'border-line text-ink-soft hover:bg-accent/10'}"
			>
				{locale.label}
			</button>
		{/each}
	</div>
</section>

<section class="border-b border-line px-4 py-5">
	<h2 class="text-sm font-semibold text-ink-strong">{t('settings.notifications.title')}</h2>
	<p class="mt-1 text-sm text-ink-soft">{t('settings.notifications.description')}</p>

	{#if !pushStore.supported}
		<p class="mt-4 rounded-xl border border-line bg-surface-2 p-3 text-sm text-ink-soft">
			{t('settings.push.unsupported')}
		</p>
	{:else}
		<div class="mt-4 flex items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-sm font-medium text-ink-strong">
					{pushStore.enabled ? t('settings.push.enabled') : t('settings.push.disabled')}
				</p>
				<p class="text-xs text-ink-faint">
					{pushStore.enabled ? t('settings.push.enabledHint') : t('settings.push.disabledHint')}
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
				{pushStore.busy
					? '…'
					: pushStore.enabled
						? t('settings.push.disable')
						: t('settings.push.enable')}
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
						{t('settings.push.relogin')}
					</button>
				{/if}
			</div>
		{/if}

		<p class="mt-3 text-xs text-ink-faint">{t('settings.push.iosHint')}</p>
	{/if}
</section>

<section class="border-b border-line px-4 py-5">
	<h2 class="text-sm font-semibold text-ink-strong">{t('settings.appearance.title')}</h2>
	<p class="mt-1 text-sm text-ink-soft">{t('settings.appearance.description')}</p>

	<div class="mt-4 grid grid-cols-3 gap-2" role="group" aria-label={t('settings.appearance.group')}>
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
				<span>{option.label()}</span>
			</button>
		{/each}
	</div>
</section>

<section class="border-b border-line px-4 py-5">
	<h2 class="text-sm font-semibold text-ink-strong">{t('settings.pull.title')}</h2>
	<p class="mt-1 text-sm text-ink-soft">{t('settings.pull.description')}</p>

	<div class="mt-4 grid gap-2 sm:grid-cols-3" role="group" aria-label={t('settings.pull.group')}>
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
						: 'text-ink-strong'}">{option.label()}</span
				>
				<span class="mt-0.5 block text-xs text-ink-soft">{option.hint()}</span>
			</button>
		{/each}
	</div>

	{#if preferences.pullToRefreshEnabled}
		<p class="mt-3 text-xs text-ink-faint">{t('settings.pull.onHint')}</p>
	{:else}
		<p class="mt-3 text-xs text-ink-faint">{t('settings.pull.offHint')}</p>
	{/if}
</section>

<section class="border-b border-line px-4 py-5">
	<h2 class="text-sm font-semibold text-ink-strong">{t('settings.motion.title')}</h2>
	<p class="mt-1 text-sm text-ink-soft">{t('settings.motion.description')}</p>

	<div class="mt-4 grid grid-cols-2 gap-2" role="group" aria-label={t('settings.motion.group')}>
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
						: 'text-ink-strong'}">{option.label()}</span
				>
				<span class="mt-0.5 block text-xs text-ink-soft">{option.hint()}</span>
			</button>
		{/each}
	</div>
</section>

<section class="border-b border-line px-4 py-5">
	<h2 class="text-sm font-semibold text-ink-strong">{t('settings.text.title')}</h2>
	<p class="mt-1 text-sm text-ink-soft">{t('settings.text.description')}</p>

	<div class="mt-4 flex items-center gap-3">
		<button
			type="button"
			onclick={() => preferences.decreaseText()}
			disabled={!preferences.canDecrease}
			aria-label={t('settings.text.decrease')}
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
			aria-label={t('settings.text.increase')}
			class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-line px-2 font-semibold text-ink-strong transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
		>
			A+
		</button>
	</div>

	<label class="mt-4 block">
		<span class="sr-only">{t('settings.text.percent')}</span>
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
		<p class="text-xs text-ink-faint">{t('settings.text.range')}</p>
		{#if preferences.textScale !== 1}
			<button
				type="button"
				onclick={() => preferences.resetText()}
				class="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-accent/10"
			>
				{t('settings.text.reset')}
			</button>
		{/if}
	</div>

	<div class="mt-5 rounded-xl border border-line bg-surface-2 p-4">
		<p class="text-xs font-medium tracking-wide text-ink-faint uppercase">
			{t('settings.text.preview')}
		</p>
		<p class="mt-2 text-ink">{t('settings.text.previewText')}</p>
	</div>
</section>

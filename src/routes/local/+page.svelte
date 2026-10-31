<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import TimelineView from '#lib/components/TimelineView.svelte';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { localFeed } from '#lib/stores/feed.svelte.ts';
</script>

<header class="sticky top-0 z-20 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur">
	<h1 class="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink-strong">
		<Icon name="globe" size={18} class="text-accent" />
		{t('local.title')}
	</h1>
</header>

<TimelineView feed={localFeed} emptyText={t('local.empty')} />

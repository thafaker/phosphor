<script lang="ts">
	import Composer from '#lib/components/Composer.svelte';
	import TimelineView from '#lib/components/TimelineView.svelte';
	import { homeFeed } from '#lib/stores/feed.svelte.ts';
</script>

<header class="sticky top-0 z-20 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur">
	<h1 class="text-lg font-semibold tracking-tight text-ink-strong">Start</h1>
</header>

<Composer />

<TimelineView feed={homeFeed} emptyText="Deine Start-Timeline ist noch leer." />

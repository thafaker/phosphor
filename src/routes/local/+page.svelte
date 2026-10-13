<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import TimelineView from '#lib/components/TimelineView.svelte';
	import { localFeed } from '#lib/stores/feed.svelte.ts';
</script>

<header
	class="sticky top-0 z-20 border-b border-emerald-400/10 bg-[#07110b]/85 px-4 py-3 backdrop-blur"
>
	<h1 class="flex items-center gap-2 text-lg font-semibold tracking-tight text-emerald-50">
		<Icon name="globe" size={18} class="text-emerald-400" />
		Lokale Timeline
	</h1>
</header>

<TimelineView
	feed={localFeed}
	emptyText="Auf dieser Instanz wurde bisher nichts Öffentliches gepostet."
/>

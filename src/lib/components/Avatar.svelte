<script lang="ts">
	interface Props {
		src: string;
		alt: string;
		size?: number;
		class?: string;
	}

	let { src, alt, size = 44, class: className = '' }: Props = $props();
</script>

<img
	{src}
	{alt}
	width={size}
	height={size}
	loading="lazy"
	referrerpolicy="no-referrer"
	class="shrink-0 rounded-full bg-inset object-cover ring-1 ring-line {className}"
/>

<script lang="ts">
	interface Props {
		src: string;
		alt: string;
		size?: number;
		class?: string;
	}

	let { src, alt, size = 44, class: className = '' }: Props = $props();

	// Explicit square size in px; `--ui-scale` follows the accessibility text size
	// so the avatar grows with the copy. Inline CSS is required because Tailwind's
	// preflight sets `img { height: auto }`, which would break the square crop.
	const box = $derived(`calc(${size}px * var(--ui-scale))`);
</script>

<img
	{src}
	{alt}
	width={size}
	height={size}
	loading="lazy"
	referrerpolicy="no-referrer"
	style="width: {box}; height: {box}"
	class="aspect-square shrink-0 rounded-full bg-inset object-cover ring-1 ring-line {className}"
/>

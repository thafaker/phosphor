<script lang="ts">
	interface Props {
		src: string;
		alt: string;
		size?: number;
		class?: string;
	}

	let { src, alt, size = 44, class: className = '' }: Props = $props();

	// Explicit width/height in rem so the avatar always stays a square (Tailwind's
	// preflight sets `img { height: auto }`, which would otherwise break the crop)
	// and scales together with the accessible text-size setting.
	const box = $derived(`${size / 16}rem`);
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

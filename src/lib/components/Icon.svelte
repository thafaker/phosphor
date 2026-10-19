<script lang="ts">
	const paths: Record<string, string[]> = {
		home: ['M3 11l9-7 9 7', 'M5 10v10h5v-6h4v6h5V10'],
		bell: ['M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6', 'M10 20a2 2 0 0 0 4 0'],
		globe: [
			'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
			'M3 12h18',
			'M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9'
		],
		user: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'M4 21c0-4 3.5-6 8-6s8 2 8 6'],
		hashtag: ['M5 9h14', 'M5 15h14', 'M10 4l-2 16', 'M16 4l-2 16'],
		reply: ['M9 7l-5 5 5 5', 'M4 12h9a7 7 0 0 1 7 7v1'],
		boost: [
			'M17 2l4 4-4 4',
			'M3 11v-1a4 4 0 0 1 4-4h14',
			'M7 22l-4-4 4-4',
			'M21 13v1a4 4 0 0 1-4 4H3'
		],
		star: ['M12 3l2.9 5.9 6.1.9-4.5 4.3 1.1 6.1L12 17.3 6.4 20.2l1.1-6.1L3 9.8l6.1-.9z'],
		bookmark: ['M6 4h12v17l-6-4-6 4z'],
		pencil: ['M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'],
		trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
		eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6'],
		send: ['M4 12l16-8-6.5 16-3-6.2z', 'M20 4l-6.5 16'],
		plus: ['M12 5v14', 'M5 12h14'],
		close: ['M6 6l12 12', 'M18 6L6 18'],
		'link-out': [
			'M14 4h6v6',
			'M20 4l-8 8',
			'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'
		],
		'chevron-left': ['M15 6l-6 6 6 6'],
		refresh: ['M20 12a8 8 0 1 1-2.3-5.6', 'M20 4v5h-5'],
		image: [
			'M3 5h18v14H3z',
			'M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
			'M3 16l5-4 4 3 4-4 5 4'
		],
		alert: ['M12 4L2 20h20z', 'M12 10v4', 'M12 16.5v.5'],
		logout: ['M15 4h4v16h-4', 'M10 12H3', 'M6 8l-4 4 4 4'],
		lock: ['M5 11h14v9H5z', 'M8 11V8a4 4 0 0 1 8 0v3'],
		at: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'M16 12v1a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8'],
		sparkles: [
			'M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z',
			'M19 15l.7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8L16.5 17.5l1.8-.7z'
		],
		users: [
			'M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
			'M2 21c0-3.5 3-6 7-6s7 2.5 7 6',
			'M17 5a3.5 3.5 0 0 1 0 7',
			'M18 15c2.5.5 4 2.5 4 6'
		],
		settings: [
			'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
			'M12 2v3',
			'M12 19v3',
			'M2 12h3',
			'M19 12h3',
			'M4.9 4.9l2.1 2.1',
			'M17 17l2.1 2.1',
			'M19.1 4.9L17 7',
			'M7 17l-2.1 2.1'
		],
		check: ['M5 12l5 5 9-11'],
		info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M12 11v5', 'M12 8v.5'],
		sun: [
			'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
			'M12 2v2',
			'M12 20v2',
			'M2 12h2',
			'M20 12h2',
			'M4.9 4.9l1.4 1.4',
			'M17.7 17.7l1.4 1.4',
			'M19.1 4.9l-1.4 1.4',
			'M6.3 17.7l-1.4 1.4'
		],
		moon: ['M20.5 14.5A8 8 0 0 1 9.5 3.5a8 8 0 1 0 11 11z'],
		'text-size': ['M4 7V5h9v2', 'M8.5 5v14', 'M13.5 12v-1.5H21V12', 'M17.25 10.5V19']
	};

	interface Props {
		name: keyof typeof paths | string;
		size?: number;
		filled?: boolean;
		class?: string;
	}

	let { name, size = 20, filled = false, class: className = '' }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill={filled ? 'currentColor' : 'none'}
	stroke="currentColor"
	stroke-width="1.75"
	stroke-linecap="round"
	stroke-linejoin="round"
	style="width: calc({size}px * var(--ui-scale)); height: calc({size}px * var(--ui-scale))"
	class={className}
	aria-hidden="true"
>
	{#each paths[name] ?? [] as d (d)}
		<path {d} />
	{/each}
</svg>

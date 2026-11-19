<script lang="ts">
	import { APP_REPO, APP_VERSION, APP_WEBSITE } from '#lib/config.ts';

	type Status = 'unknown' | 'current' | 'outdated';

	let status = $state<Status>('unknown');

	function normalize(v: string): string {
		return v.trim().replace(/^[vV]\.?/, '');
	}

	async function fetchLatest(): Promise<string | null> {
		// Prefer releases; fall back to tags for repos without a published release.
		const endpoints = [
			`https://api.github.com/repos/${APP_REPO}/releases/latest`,
			`https://api.github.com/repos/${APP_REPO}/tags?per_page=1`
		];
		for (const url of endpoints) {
			try {
				const res = await fetch(url, {
					headers: { Accept: 'application/vnd.github+json' }
				});
				if (!res.ok) continue;
				const data = await res.json();
				if (Array.isArray(data)) {
					const name = data[0]?.name ?? data[0]?.tag_name ?? '';
					if (name) return String(name);
				} else {
					const name = data?.tag_name ?? data?.name ?? '';
					if (name) return String(name);
				}
			} catch {
				// ignore and try next / fall through to unknown
			}
		}
		return null;
	}

	$effect(() => {
		let cancelled = false;
		void (async () => {
			const latest = await fetchLatest();
			if (cancelled) return;
			if (!latest) {
				status = 'unknown';
				return;
			}
			status = normalize(latest) === normalize(APP_VERSION) ? 'current' : 'outdated';
		})();
		return () => {
			cancelled = true;
		};
	});

	const href = $derived(`${APP_WEBSITE}/releases`);
	const label = $derived(`V.${APP_VERSION}`);
	const colorClass = $derived(
		status === 'current'
			? 'text-emerald-600 dark:text-emerald-400'
			: status === 'outdated'
				? 'text-red-600 dark:text-red-400'
				: 'text-ink-faint'
	);
	const title = $derived(
		status === 'current'
			? 'Aktuelle Version'
			: status === 'outdated'
				? 'Update verfügbar'
				: 'Version'
	);
</script>

<a
	{href}
	target="_blank"
	rel="noopener noreferrer"
	class="fixed right-2 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-20 rounded px-1.5 py-0.5 font-mono text-[10px] leading-none opacity-70 transition hover:opacity-100 md:bottom-2 {colorClass}"
	{title}
>
	{label}
</a>

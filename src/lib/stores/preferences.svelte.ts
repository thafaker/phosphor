const STORAGE_KEY = 'phosphor:prefs:v1';

export type ThemePreference = 'system' | 'light' | 'dark';

/** `system` follows the OS `prefers-reduced-motion` setting. */
export type MotionPreference = 'system' | 'reduce';

/** How a downward drag at the top of a page refreshes it. */
export type PullToRefreshPreference = 'auto' | 'always' | 'never';

/** Steps for the accessible text-size control (100 % – 200 %). */
export const TEXT_SCALES = [1, 1.125, 1.25, 1.5, 1.75, 2] as const;

interface Persisted {
	theme: ThemePreference;
	textScale: number;
	motion: MotionPreference;
	pullToRefresh: PullToRefreshPreference;
}

const DEFAULTS: Persisted = {
	theme: 'system',
	textScale: 1,
	motion: 'system',
	pullToRefresh: 'auto'
};

function load(): Persisted {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULTS };
		const parsed = JSON.parse(raw) as Partial<Persisted>;
		const theme: ThemePreference =
			parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
				? parsed.theme
				: DEFAULTS.theme;
		const scale = typeof parsed.textScale === 'number' ? parsed.textScale : DEFAULTS.textScale;
		const motion: MotionPreference =
			parsed.motion === 'reduce' || parsed.motion === 'system' ? parsed.motion : DEFAULTS.motion;
		const pullToRefresh: PullToRefreshPreference =
			parsed.pullToRefresh === 'always' ||
			parsed.pullToRefresh === 'never' ||
			parsed.pullToRefresh === 'auto'
				? parsed.pullToRefresh
				: DEFAULTS.pullToRefresh;
		return { theme, textScale: closestScale(scale), motion, pullToRefresh };
	} catch {
		return { ...DEFAULTS };
	}
}

function closestScale(value: number): number {
	let best: number = TEXT_SCALES[0];
	for (const step of TEXT_SCALES) {
		if (Math.abs(step - value) < Math.abs(best - value)) best = step;
	}
	return best;
}

function resolve(theme: ThemePreference): 'light' | 'dark' {
	if (theme !== 'system') return theme;
	return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * True when the app runs as an installed web app rather than in a browser tab
 * (Android/Chromium: `display-mode`, iOS/Safari: the legacy `navigator.standalone`).
 */
function isStandalone(): boolean {
	if (typeof window === 'undefined') return false;
	const legacy = (navigator as Navigator & { standalone?: boolean }).standalone;
	return window.matchMedia('(display-mode: standalone)').matches || legacy === true;
}

class Preferences {
	theme = $state<ThemePreference>(DEFAULTS.theme);
	textScale = $state<number>(DEFAULTS.textScale);
	motion = $state<MotionPreference>(DEFAULTS.motion);
	pullToRefresh = $state<PullToRefreshPreference>(DEFAULTS.pullToRefresh);

	#media: MediaQueryList | null = null;

	/** Called once from the app shell. */
	init(): void {
		const persisted = load();
		this.theme = persisted.theme;
		this.textScale = persisted.textScale;
		this.motion = persisted.motion;
		this.pullToRefresh = persisted.pullToRefresh;

		this.#media = window.matchMedia('(prefers-color-scheme: light)');
		this.#media.addEventListener('change', this.#onSystemChange);
		this.apply();
	}

	#onSystemChange = (): void => {
		if (this.theme === 'system') this.apply();
	};

	get canIncrease(): boolean {
		return this.textScale < TEXT_SCALES[TEXT_SCALES.length - 1];
	}

	get canDecrease(): boolean {
		return this.textScale > TEXT_SCALES[0];
	}

	setTheme(theme: ThemePreference): void {
		this.theme = theme;
		this.persist();
		this.apply();
	}

	setTextScale(scale: number): void {
		this.textScale = closestScale(scale);
		this.persist();
		this.apply();
	}

	setMotion(motion: MotionPreference): void {
		this.motion = motion;
		this.persist();
		this.apply();
	}

	setPullToRefresh(pullToRefresh: PullToRefreshPreference): void {
		this.pullToRefresh = pullToRefresh;
		this.persist();
		this.apply();
	}

	/**
	 * Whether dragging down at the top should refresh. `auto` means "only where
	 * the browser has no pull-to-refresh of its own", i.e. an installed PWA;
	 * inside a browser tab the native gesture stays untouched.
	 */
	get pullToRefreshEnabled(): boolean {
		if (this.pullToRefresh === 'always') return true;
		if (this.pullToRefresh === 'never') return false;
		return isStandalone();
	}

	increaseText(): void {
		const next = TEXT_SCALES.find((step) => step > this.textScale);
		if (next) this.setTextScale(next);
	}

	decreaseText(): void {
		const next = [...TEXT_SCALES].reverse().find((step) => step < this.textScale);
		if (next) this.setTextScale(next);
	}

	resetText(): void {
		this.setTextScale(1);
	}

	/** Push the current preference into the DOM (theme attribute + scale var). */
	apply(): void {
		const root = document.documentElement;
		const theme = resolve(this.theme);
		root.dataset.theme = theme;
		root.dataset.motion = this.motion;
		root.style.setProperty('--text-scale', String(this.textScale));
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', theme === 'light' ? '#f5fbf8' : '#07110b');
	}

	private persist(): void {
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					theme: this.theme,
					textScale: this.textScale,
					motion: this.motion,
					pullToRefresh: this.pullToRefresh
				})
			);
		} catch {
			// ignore (e.g. storage disabled)
		}
	}
}

export const preferences = new Preferences();

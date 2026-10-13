const STORAGE_KEY = 'phosphor:prefs:v1';

export type ThemePreference = 'system' | 'light' | 'dark';

/** Steps for the accessible text-size control (100 % – 200 %). */
export const TEXT_SCALES = [1, 1.125, 1.25, 1.5, 1.75, 2] as const;

interface Persisted {
	theme: ThemePreference;
	textScale: number;
}

const DEFAULTS: Persisted = { theme: 'system', textScale: 1 };

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
		return { theme, textScale: closestScale(scale) };
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

class Preferences {
	theme = $state<ThemePreference>(DEFAULTS.theme);
	textScale = $state<number>(DEFAULTS.textScale);

	#media: MediaQueryList | null = null;

	/** Called once from the app shell. */
	init(): void {
		const persisted = load();
		this.theme = persisted.theme;
		this.textScale = persisted.textScale;

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
		root.style.setProperty('--text-scale', String(this.textScale));
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', theme === 'light' ? '#f5fbf8' : '#07110b');
	}

	private persist(): void {
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ theme: this.theme, textScale: this.textScale })
			);
		} catch {
			// ignore (e.g. storage disabled)
		}
	}
}

export const preferences = new Preferences();

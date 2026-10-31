import { de, type MessageKey } from './messages/de.ts';
import { en } from './messages/en.ts';

export type { MessageKey };

export type Locale = 'de' | 'en';

export const LOCALES: { value: Locale; label: string }[] = [
	{ value: 'de', label: 'Deutsch' },
	{ value: 'en', label: 'English' }
];

const STORAGE_KEY = 'phosphor:locale:v1';

const messages: Record<Locale, Record<MessageKey, string>> = { de, en };

function isLocale(value: unknown): value is Locale {
	return value === 'de' || value === 'en';
}

/** Saved choice first, then the browser's preferred language, then German. */
function detectLocale(): Locale {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (isLocale(stored)) return stored;
	} catch {
		// storage may be disabled
	}
	if (typeof window !== 'undefined') {
		const preferred = window.navigator.languages?.[0] ?? window.navigator.language ?? '';
		if (preferred) return preferred.toLowerCase().startsWith('de') ? 'de' : 'en';
	}
	return 'de';
}

class I18n {
	locale = $state<Locale>(detectLocale());

	/** Called once from the app shell; applies the language to the document. */
	init(): void {
		this.locale = detectLocale();
		this.apply();
	}

	setLocale(locale: Locale): void {
		this.locale = locale;
		try {
			localStorage.setItem(STORAGE_KEY, locale);
		} catch {
			// ignore (e.g. storage disabled)
		}
		this.apply();
	}

	t(key: MessageKey, params?: Record<string, string | number>): string {
		const template = messages[this.locale][key] ?? de[key] ?? key;
		if (!params) return template;
		return template.replace(/\{(\w+)\}/g, (match, name: string) =>
			name in params ? String(params[name]) : match
		);
	}

	/**
	 * Pick a singular/plural message. German and English both switch at exactly
	 * one; the two explicit keys keep the catalogue readable.
	 */
	plural(
		count: number,
		one: MessageKey,
		other: MessageKey,
		params: Record<string, string | number> = {}
	): string {
		return this.t(count === 1 ? one : other, { ...params, count });
	}

	private apply(): void {
		if (typeof document !== 'undefined') document.documentElement.lang = this.locale;
	}
}

export const i18n = new I18n();

/** Shorthand for `i18n.t`; reads the reactive locale when used in a component. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
	return i18n.t(key, params);
}

/** Shorthand for `i18n.plural`. */
export function plural(
	count: number,
	one: MessageKey,
	other: MessageKey,
	params?: Record<string, string | number>
): string {
	return i18n.plural(count, one, other, params);
}

/** Locale tag for `Intl` formatters; reactive when used during rendering. */
export function currentLocale(): Locale {
	return i18n.locale;
}

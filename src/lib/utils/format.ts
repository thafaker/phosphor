import { currentLocale } from '#lib/i18n/index.svelte.ts';

const compactFormatters = new Map<string, Intl.NumberFormat>();
const fullFormatters = new Map<string, Intl.NumberFormat>();

function compact(locale: string): Intl.NumberFormat {
	let formatter = compactFormatters.get(locale);
	if (!formatter) {
		formatter = new Intl.NumberFormat(locale, {
			notation: 'compact',
			maximumFractionDigits: 1
		});
		compactFormatters.set(locale, formatter);
	}
	return formatter;
}

function full(locale: string): Intl.NumberFormat {
	let formatter = fullFormatters.get(locale);
	if (!formatter) {
		formatter = new Intl.NumberFormat(locale);
		fullFormatters.set(locale, formatter);
	}
	return formatter;
}

/** Compact interaction counts; empty string for zero (like Mastodon). */
export function formatCount(value: number, locale = currentLocale()): string {
	if (!value || value <= 0) return '';
	return compact(locale).format(value);
}

/** Full number for stats where a literal "0" matters (profile counts). */
export function formatStat(value: number, locale = currentLocale()): string {
	return full(locale).format(value);
}

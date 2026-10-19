const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function relativeFormatter(locale: string): Intl.RelativeTimeFormat {
	let formatter = relativeFormatters.get(locale);
	if (!formatter) {
		formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
		relativeFormatters.set(locale, formatter);
	}
	return formatter;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 1000 * 60 * 60 * 24 * 365],
	['month', 1000 * 60 * 60 * 24 * 30],
	['week', 1000 * 60 * 60 * 24 * 7],
	['day', 1000 * 60 * 60 * 24],
	['hour', 1000 * 60 * 60],
	['minute', 1000 * 60]
];

export function relativeTime(iso: string, locale = 'de'): string {
	const diff = new Date(iso).getTime() - Date.now();
	for (const [unit, ms] of UNITS) {
		if (Math.abs(diff) >= ms) {
			return relativeFormatter(locale).format(Math.round(diff / ms), unit);
		}
	}
	return relativeFormatter(locale).format(Math.round(diff / 1000), 'second');
}

export function absoluteTime(iso: string, locale = 'de'): string {
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
		new Date(iso)
	);
}

/** Date without the time, e.g. for "joined on …" on a profile. */
export function absoluteDate(iso: string, locale = 'de'): string {
	return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(iso));
}

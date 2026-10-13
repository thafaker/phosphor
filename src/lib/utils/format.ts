const compact = new Intl.NumberFormat('de', {
	notation: 'compact',
	maximumFractionDigits: 1
});

/** Compact interaction counts; empty string for zero (like Mastodon). */
export function formatCount(value: number): string {
	if (!value || value <= 0) return '';
	return compact.format(value);
}

export function formatFullCount(locale = 'de') {
	return new Intl.NumberFormat(locale);
}

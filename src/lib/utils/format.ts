const compact = new Intl.NumberFormat('de', {
	notation: 'compact',
	maximumFractionDigits: 1
});

const full = new Intl.NumberFormat('de');

/** Compact interaction counts; empty string for zero (like Mastodon). */
export function formatCount(value: number): string {
	if (!value || value <= 0) return '';
	return compact.format(value);
}

/** Full number for stats where a literal "0" matters (profile counts). */
export function formatStat(value: number): string {
	return full.format(value);
}

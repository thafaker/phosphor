import { describe, expect, it } from 'vitest';
import { instanceHost, normalizeInstanceUrl } from './instance.ts';

describe('normalizeInstanceUrl', () => {
	it.each([
		['example.social', 'https://example.social'],
		['  example.social  ', 'https://example.social'],
		['https://example.social/', 'https://example.social'],
		['https://Example.Social', 'https://example.social'],
		['http://localhost:8080/', 'http://localhost:8080'],
		['https://example.social:8443', 'https://example.social:8443'],
		['https://example.social/@user', 'https://example.social'],
		['https://example.social/?x=1#frag', 'https://example.social']
	])('normalisiert %j zu %j', (input, expected) => {
		expect(normalizeInstanceUrl(input)).toBe(expected);
	});

	it.each([
		['', 'leer'],
		['   ', 'nur Leerzeichen'],
		['ftp://example.social', 'falsches Schema'],
		['javascript:alert(1)', 'kein http(s)'],
		['https://user:pass@example.social', 'Zugangsdaten in der URL'],
		['https://', 'kein Host'],
		['not a url', 'Leerzeichen im Host']
	])('weist %j zurück (%s)', (input) => {
		expect(normalizeInstanceUrl(input)).toBeNull();
	});
});

describe('instanceHost', () => {
	it('zeigt den Host ohne Schema', () => {
		expect(instanceHost('https://social.example.org')).toBe('social.example.org');
		expect(instanceHost('http://localhost:8080')).toBe('localhost:8080');
	});

	it('bleibt bei leerer/ungültiger Eingabe harmlos', () => {
		expect(instanceHost('')).toBe('');
		expect(instanceHost(null)).toBe('');
		expect(instanceHost('quatsch')).toBe('quatsch');
	});
});

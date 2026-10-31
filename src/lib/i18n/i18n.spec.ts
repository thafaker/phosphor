import { beforeEach, describe, expect, it } from 'vitest';
import { currentLocale, i18n, plural, t } from './index.svelte.ts';

beforeEach(() => i18n.setLocale('de'));

describe('i18n', () => {
	it('returns German by default', () => {
		expect(currentLocale()).toBe('de');
		expect(t('nav.home')).toBe('Start');
	});

	it('interpolates named parameters', () => {
		expect(t('account.joined', { date: '1. Januar 2024' })).toBe('Beigetreten am 1. Januar 2024');
	});

	it('switches to English and back', () => {
		i18n.setLocale('en');
		expect(currentLocale()).toBe('en');
		expect(t('nav.home')).toBe('Home');
		i18n.setLocale('de');
		expect(t('nav.home')).toBe('Start');
	});

	it('picks singular and plural forms', () => {
		i18n.setLocale('en');
		expect(plural(1, 'search.posts.one', 'search.posts.other')).toBe('1 post');
		expect(plural(2, 'search.posts.one', 'search.posts.other')).toBe('2 posts');
	});
});

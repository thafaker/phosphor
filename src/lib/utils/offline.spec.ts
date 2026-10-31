import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCachedLists, offlineKey, readCachedList, writeCachedList } from './offline.ts';

class MemoryStorage implements Storage {
	private readonly data = new Map<string, string>();

	get length(): number {
		return this.data.size;
	}

	clear(): void {
		this.data.clear();
	}

	getItem(key: string): string | null {
		return this.data.get(key) ?? null;
	}

	key(index: number): string | null {
		return [...this.data.keys()][index] ?? null;
	}

	removeItem(key: string): void {
		this.data.delete(key);
	}

	setItem(key: string, value: string): void {
		this.data.set(key, value);
	}
}

beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('offline list cache', () => {
	it('round-trips items and a timestamp', () => {
		const key = offlineKey('home', 'https://social.example|1');
		writeCachedList(key, [{ id: 'a' }, { id: 'b' }]);

		const cached = readCachedList<{ id: string }>(key);
		expect(cached?.items).toEqual([{ id: 'a' }, { id: 'b' }]);
		expect(cached?.at).toBeTypeOf('number');
	});

	it('keeps only the requested number of items', () => {
		const key = offlineKey('home', 'scope');
		writeCachedList(key, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], 2);

		expect(readCachedList(key)?.items).toHaveLength(2);
	});

	it('returns null for corrupt or foreign storage', () => {
		const key = offlineKey('home', 'scope');
		localStorage.setItem(key, '{not json');
		expect(readCachedList(key)).toBeNull();
		localStorage.setItem(key, JSON.stringify({ items: 'nope', at: 1 }));
		expect(readCachedList(key)).toBeNull();
	});

	it('clears every cached list but leaves unrelated keys alone', () => {
		localStorage.setItem('phosphor:prefs:v1', 'keep');
		writeCachedList(offlineKey('home', 'scope'), []);
		writeCachedList(offlineKey('notifications', 'scope'), []);

		clearCachedLists();

		expect(localStorage.getItem('phosphor:prefs:v1')).toBe('keep');
		expect(localStorage.getItem(offlineKey('home', 'scope'))).toBeNull();
		expect(localStorage.getItem(offlineKey('notifications', 'scope'))).toBeNull();
	});
});

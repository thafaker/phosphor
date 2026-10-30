import { describe, expect, it } from 'vitest';
import type { InstanceLimits } from '#lib/api/types.ts';
import { formatBytes, mediaTypeFor, validateMediaFile } from './media.ts';

const limits: InstanceLimits = {
	maxChars: 5000,
	maxMediaAttachments: 6,
	imageSizeLimit: 2 * 1024 * 1024,
	videoSizeLimit: 8 * 1024 * 1024,
	descriptionLimit: 1500,
	supportedMediaTypes: ['image/png', 'video/mp4']
};

function makeFile(name: string, type: string, size = 1024): File {
	return new File([new Uint8Array(size)], name, { type });
}

describe('formatBytes', () => {
	it('rounds to whole units', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2048)).toBe('2 KB');
		expect(formatBytes(40 * 1024 * 1024)).toBe('40 MB');
	});
});

describe('mediaTypeFor', () => {
	it('maps MIME types to the coarse media kinds', () => {
		expect(mediaTypeFor('image/jpeg')).toBe('image');
		expect(mediaTypeFor('image/gif')).toBe('image');
		expect(mediaTypeFor('video/mp4')).toBe('video');
		expect(mediaTypeFor('audio/ogg')).toBe('audio');
		expect(mediaTypeFor('application/pdf')).toBe('unknown');
	});
});

describe('validateMediaFile', () => {
	it('rejects types the instance does not accept', () => {
		expect(validateMediaFile(makeFile('a.gif', 'image/gif'), limits)).toContain('Dateityp');
	});

	it('accepts an advertised type within the size limit', () => {
		expect(validateMediaFile(makeFile('a.png', 'image/png'), limits)).toBeNull();
	});

	it('rejects an oversized image using the image limit', () => {
		const big = makeFile('big.png', 'image/png', 2 * 1024 * 1024 + 1);
		expect(validateMediaFile(big, limits)).toContain('zu groß');
	});

	it('lässt zu große Bilder vor der Komprimierung zu', () => {
		const big = makeFile('big.png', 'image/png', 8 * 1024 * 1024);
		expect(validateMediaFile(big, limits, { allowOversizeImages: true })).toBeNull();
	});

	it('wendet die Ausnahme nicht auf Videos an', () => {
		const big = makeFile('big.mp4', 'video/mp4', 9 * 1024 * 1024);
		expect(validateMediaFile(big, limits, { allowOversizeImages: true })).toContain('zu groß');
	});

	it('measures video against the video limit, not the image limit', () => {
		const size = 4 * 1024 * 1024;
		expect(validateMediaFile(makeFile('clip.mp4', 'video/mp4', size), limits)).toBeNull();
		expect(validateMediaFile(makeFile('big.png', 'image/png', size), limits)).toContain('zu groß');
	});

	it('skips the type check when the instance advertises nothing', () => {
		const permissive = { ...limits, supportedMediaTypes: [] };
		expect(validateMediaFile(makeFile('a.gif', 'image/gif'), permissive)).toBeNull();
	});
});

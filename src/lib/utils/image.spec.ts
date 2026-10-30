import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_EDGE, scaledDimensions } from './image.ts';

describe('scaledDimensions', () => {
	it('begrenzt Querformat auf die lange Kante', () => {
		expect(scaledDimensions(4032, 3024, MAX_IMAGE_EDGE)).toEqual({ width: 1024, height: 768 });
	});

	it('begrenzt Hochformat auf die lange Kante', () => {
		expect(scaledDimensions(3024, 4032, MAX_IMAGE_EDGE)).toEqual({ width: 768, height: 1024 });
	});

	it('lässt kleinere Bilder unverändert', () => {
		expect(scaledDimensions(800, 600, MAX_IMAGE_EDGE)).toEqual({ width: 800, height: 600 });
	});

	it('behält das Seitenverhältnis bei extrem schmalen Bildern', () => {
		expect(scaledDimensions(10_000, 1, MAX_IMAGE_EDGE)).toEqual({ width: 1024, height: 1 });
	});
});

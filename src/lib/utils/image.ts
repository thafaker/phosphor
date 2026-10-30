import type { InstanceLimits } from '#lib/api/types.ts';

/**
 * Client-side photo compression before upload.
 *
 * GoToSocial does not transcode uploads, and the instance accepts large files,
 * so a phone photo would otherwise be stored (and served) at full size. We
 * resize to a 1024 px long edge and re-encode as JPEG; the re-encode also
 * strips EXIF/GPS metadata. GIF, SVG, APNG and other non-photo formats are
 * left alone so animations/transparency/vector sharpness survive.
 */
export const MAX_IMAGE_EDGE = 1024;
/** Aim for a responsive image even on a slow home uplink. */
export const IMAGE_TARGET_BYTES = 300 * 1024;
/** Small files are not worth a decode/re-encode round-trip. */
const SKIP_BELOW_BYTES = 600 * 1024;
const MIN_EDGE = 512;
const START_QUALITY = 0.82;
const MIN_QUALITY = 0.64;

const COMPRESSIBLE_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
	'image/heic',
	'image/heif'
]);

export interface ImageCompressionResult {
	file: File;
	/** False when the original was already small enough or could not be decoded. */
	compressed: boolean;
	originalSize: number;
}

export function scaledDimensions(
	width: number,
	height: number,
	maxEdge: number
): { width: number; height: number } {
	const longest = Math.max(width, height);
	if (longest <= maxEdge) return { width, height };
	const scale = maxEdge / longest;
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}

interface DecodedImage {
	source: CanvasImageSource;
	width: number;
	height: number;
	cleanup: () => void;
}

async function decodeImage(file: File): Promise<DecodedImage | null> {
	if (typeof createImageBitmap === 'function') {
		try {
			// `from-image` applies EXIF orientation before we draw.
			const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
			return {
				source: bitmap,
				width: bitmap.width,
				height: bitmap.height,
				cleanup: () => bitmap.close()
			};
		} catch {
			// fall through to the <img> decoder
		}
	}

	const url = URL.createObjectURL(file);
	try {
		const image = new Image();
		image.src = url;
		await image.decode();
		return {
			source: image,
			width: image.naturalWidth,
			height: image.naturalHeight,
			cleanup: () => URL.revokeObjectURL(url)
		};
	} catch {
		URL.revokeObjectURL(url);
		return null;
	}
}

interface CanvasPair {
	canvas: HTMLCanvasElement;
	context: CanvasRenderingContext2D;
}

function createCanvas(width: number, height: number): CanvasPair | null {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	return context ? { canvas, context } : null;
}

function encodeCanvas(
	canvas: HTMLCanvasElement,
	type: string,
	quality?: number
): Promise<Blob | null> {
	return new Promise((resolve) => {
		canvas.toBlob(resolve, type, quality);
	});
}

function unchanged(file: File): ImageCompressionResult {
	return { file, compressed: false, originalSize: file.size };
}

/**
 * Compress a photo for upload. Never throws: on any decode/encode problem the
 * original file is returned so the composer can still validate/upload it.
 */
export async function compressImage(
	file: File,
	limits: InstanceLimits
): Promise<ImageCompressionResult> {
	if (!COMPRESSIBLE_TYPES.has(file.type) || file.size <= SKIP_BELOW_BYTES) return unchanged(file);

	const decoded = await decodeImage(file);
	if (!decoded) return unchanged(file);

	try {
		const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
		const target = Math.min(
			IMAGE_TARGET_BYTES,
			limits.imageSizeLimit > 0 ? limits.imageSizeLimit : IMAGE_TARGET_BYTES
		);
		let edge = MAX_IMAGE_EDGE;
		let quality = START_QUALITY;
		let best: Blob | null = null;

		for (let attempt = 0; attempt < 6 && edge >= MIN_EDGE; attempt += 1) {
			const dimensions = scaledDimensions(decoded.width, decoded.height, edge);
			const canvas = createCanvas(dimensions.width, dimensions.height);
			if (!canvas) break;

			const { context } = canvas;
			context.imageSmoothingEnabled = true;
			context.imageSmoothingQuality = 'high';

			// JPEG has no alpha; a white base avoids black fringes for sources
			// with transparency (WebP/AVIF with alpha, for example).
			if (outputType === 'image/jpeg') {
				context.fillStyle = '#ffffff';
				context.fillRect(0, 0, dimensions.width, dimensions.height);
			}
			context.drawImage(decoded.source, 0, 0, dimensions.width, dimensions.height);

			const blob = await encodeCanvas(
				canvas.canvas,
				outputType,
				outputType === 'image/jpeg' ? quality : undefined
			);
			if (!blob) break;
			if (!best || blob.size < best.size) best = blob;
			if (blob.size <= target) break;

			if (outputType === 'image/png') {
				// PNG ignores quality; the only lever is fewer pixels.
				edge = Math.round(edge * 0.8);
			} else if (quality > MIN_QUALITY) {
				quality = Math.max(MIN_QUALITY, quality - 0.08);
			} else {
				edge = Math.round(edge * 0.8);
			}
		}

		if (!best) return unchanged(file);
		// Do not make an already acceptable file larger.
		if (best.size >= file.size && file.size <= limits.imageSizeLimit) return unchanged(file);

		const extension = outputType === 'image/png' ? 'png' : 'jpg';
		const name = file.name.replace(/\.[^.]+$/, '') + `.${extension}`;
		return {
			file: new File([best], name, { type: outputType, lastModified: Date.now() }),
			compressed: true,
			originalSize: file.size
		};
	} catch {
		return unchanged(file);
	} finally {
		decoded.cleanup();
	}
}

import type { AnyElement, Rect, TextElement } from '$lib/tools/types';
import { canvasFont, textCenter } from '$lib/tools/text';
import { getElementBounds } from '$lib/tools/elements';
import { smoothPath } from '$lib/tools/smooth';
import { DSmooth, DSmoothAmt, TextLineHeight } from '$lib/tools/defaults';
import { blurRegion, pixelateRegion, snapRegion } from './effects';
import { getImage } from './images';

export type RenderOptions = {
	skipId?: string | null;
};

export function getSceneContext(canvas: HTMLCanvasElement | OffscreenCanvas) {
	return (canvas as HTMLCanvasElement).getContext('2d', {
		willReadFrequently: true,
		colorSpace: 'srgb'
	}) as CanvasRenderingContext2D;
}

export function renderScene(
	ctx: CanvasRenderingContext2D,
	base: CanvasImageSource,
	width: number,
	height: number,
	elements: AnyElement[],
	opts: RenderOptions = {}
) {
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha = 1;
	ctx.imageSmoothingEnabled = false;
	ctx.clearRect(0, 0, width, height);
	ctx.drawImage(base, 0, 0, width, height);
	ctx.restore();

	for (const el of elements) {
		if (el.id === opts.skipId) continue;
		ctx.save();
		drawElement(ctx, el, width, height);
		ctx.restore();
	}
}

function rotateAbout(ctx: CanvasRenderingContext2D, deg: number, cx: number, cy: number) {
	if (!deg) return;
	ctx.translate(cx, cy);
	ctx.rotate((deg * Math.PI) / 180);
	ctx.translate(-cx, -cy);
}

function segment(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
	ctx.beginPath();
	ctx.moveTo(x1, y1);
	ctx.lineTo(x2, y2);
	ctx.stroke();
}

function arrowHead(
	ctx: CanvasRenderingContext2D,
	len: number,
	refRad: number,
	headDeg: number,
	sx: number,
	sy: number
) {
	for (const sign of [1, -1]) {
		const a = refRad + (sign * headDeg * Math.PI) / 180;
		segment(ctx, sx - Math.cos(a) * len, sy - Math.sin(a) * len, sx, sy);
	}
}

export function drawElement(
	ctx: CanvasRenderingContext2D,
	el: AnyElement,
	cw: number,
	ch: number
) {
	switch (el.type) {
		case 'line': {
			ctx.strokeStyle = el.color;
			ctx.lineWidth = el.thickness;
			ctx.lineCap = 'round';
			segment(ctx, el.x1, el.y1, el.x2, el.y2);
			return;
		}
		case 'arrow': {
			ctx.strokeStyle = el.color;
			ctx.lineWidth = el.thickness;
			ctx.lineCap = 'round';
			const rad = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
			segment(ctx, el.x1, el.y1, el.x2, el.y2);
			arrowHead(ctx, el.headlen, rad, el.headangle, el.x2, el.y2);
			if (el.tail) arrowHead(ctx, el.taillen, rad, el.tailangle, el.x1, el.y1);
			return;
		}
		case 'rect': {
			const x = Math.min(el.x1, el.x2);
			const y = Math.min(el.y1, el.y2);
			const w = Math.abs(el.x2 - el.x1);
			const h = Math.abs(el.y2 - el.y1);
			rotateAbout(ctx, el.rotation, (el.x1 + el.x2) / 2, (el.y1 + el.y2) / 2);
			ctx.beginPath();
			if (el.radius > 0) {
				ctx.roundRect(x, y, w, h, { x: Math.min(el.radius, w / 2), y: Math.min(el.radius, h / 2) });
			} else {
				ctx.rect(x, y, w, h);
			}
			if (el.fill) {
				ctx.fillStyle = el.fillColor;
				ctx.fill();
			}
			if (el.outline) {
				ctx.strokeStyle = el.outlineColor;
				ctx.lineWidth = el.outlineWidth;
				ctx.lineJoin = 'miter';
				ctx.miterLimit = 4; 
				ctx.stroke();
			}
			return;
		}
		case 'circle': {
			rotateAbout(ctx, el.rotation, el.cx, el.cy);
			ctx.beginPath();
			ctx.ellipse(el.cx, el.cy, Math.max(0, el.rx), Math.max(0, el.ry), 0, 0, Math.PI * 2);
			if (el.fill) {
				ctx.fillStyle = el.fillColor;
				ctx.fill();
			}
			if (el.outline) {
				ctx.strokeStyle = el.outlineColor;
				ctx.lineWidth = el.outlineWidth;
				ctx.stroke();
			}
			return;
		}
		case 'draw': {
			if (el.rotation) {
				const b = getElementBounds(el);
				rotateAbout(ctx, el.rotation, b.x + b.width / 2, b.y + b.height / 2);
			}
			const d = smoothPath(el.points, {
				mode: el.smoothing ?? DSmooth,
				amount: DSmoothAmt,
				thickness: el.thickness
			});
			ctx.strokeStyle = el.color;
			ctx.lineWidth = el.thickness;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.stroke(new Path2D(d));
			return;
		}
		case 'text':
			drawText(ctx, el);
			return;
		case 'image': {
			const bitmap = getImage(el.assetId);
			if (!bitmap) return;
			rotateAbout(ctx, el.rotation, (el.x1 + el.x2) / 2, (el.y1 + el.y2) / 2);
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(
				bitmap,
				Math.min(el.x1, el.x2),
				Math.min(el.y1, el.y2),
				Math.abs(el.x2 - el.x1),
				Math.abs(el.y2 - el.y1)
			);
			return;
		}
		case 'blur':
		case 'pixelate': {
			const region = snapRegion(el, cw, ch);
			if (!region) return;
			if (el.type === 'blur') blurRegion(ctx, region, el.radius, cw, ch);
			else pixelateRegion(ctx, region, el.size);
			return;
		}
	}
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement) {
	if (!el.text) return;
	const c = textCenter(el);
	rotateAbout(ctx, el.rotation, c.x, c.y);
	ctx.translate(el.x, el.y);
	ctx.scale(el.sx, el.sy);

	ctx.font = canvasFont(el);
	ctx.fillStyle = el.color;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';

	const m = ctx.measureText('Mg');
	const ascent = Math.round(m.fontBoundingBoxAscent);
	const descent = Math.round(m.fontBoundingBoxDescent);
	const lineH = el.fontSize * TextLineHeight;
	const lead = (lineH - (ascent + descent)) / 2;

	el.text.split('\n').forEach((line, i) => {
		ctx.fillText(line, 0, i * lineH + lead + ascent);
	});
}

const requestedFonts = new Set<string>();

export async function ensureFonts(elements: AnyElement[]): Promise<boolean> {
	const pending: Promise<unknown>[] = [];
	for (const el of elements) {
		if (el.type !== 'text') continue;
		const key = canvasFont(el);
		if (requestedFonts.has(key)) continue;
		requestedFonts.add(key);
		pending.push(document.fonts.load(key, el.text || ' ').catch(() => {}));
	}
	if (!pending.length) return false;
	await Promise.all(pending);
	return true;
}

export async function exportPng(
	base: CanvasImageSource,
	width: number,
	height: number,
	elements: AnyElement[],
	crop: Rect | null
): Promise<Blob> {
	await ensureFonts(elements);

	const full = document.createElement('canvas');
	full.width = width;
	full.height = height;
	renderScene(getSceneContext(full), base, width, height, elements);

	let out = full;
	if (crop) {
		const x = Math.max(0, Math.min(width - 1, Math.round(crop.x)));
		const y = Math.max(0, Math.min(height - 1, Math.round(crop.y)));
		const w = Math.max(1, Math.min(width, Math.round(crop.x + crop.width)) - x);
		const h = Math.max(1, Math.min(height, Math.round(crop.y + crop.height)) - y);
		out = document.createElement('canvas');
		out.width = w;
		out.height = h;
		const octx = getSceneContext(out);
		octx.imageSmoothingEnabled = false;
		octx.drawImage(full, x, y, w, h, 0, 0, w, h);
	}

	return new Promise((resolve, reject) =>
		out.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
	);
}

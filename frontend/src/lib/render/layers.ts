import type { AnyElement } from '$lib/tools/types';
import { textCenter, textSize } from '$lib/tools/text';
import { smoothPath } from '$lib/tools/smooth';
import { DSmooth, DSmoothAmt } from '$lib/tools/defaults';
import { drawElement, getSceneContext, type RenderOptions } from './scene';
import { blurRegion, pixelateRegion, snapRegion, type Region } from './effects';

export type LayerRenderOptions = RenderOptions & {
	epoch?: number;
};

type Bounds = { x0: number; y0: number; x1: number; y1: number };
type EffectElement = Extract<AnyElement, { type: 'blur' | 'pixelate' }>;

type Layer = {
	sig: string;
	rev: number;
	canvas: HTMLCanvasElement | null;
	x: number;
	y: number;
	fx: { key: string; canvas: HTMLCanvasElement | null; ready: boolean } | null;
};

const isEffect = (el: AnyElement): el is EffectElement =>
	el.type === 'blur' || el.type === 'pixelate';

function releaseCanvas(c: HTMLCanvasElement | null | undefined) {
	if (!c) return;
	c.width = 0;
	c.height = 0;
}

function rotateBounds(b: Bounds, cx: number, cy: number, deg: number): Bounds {
	if (!deg) return b;
	const r = (deg * Math.PI) / 180;
	const cos = Math.cos(r);
	const sin = Math.sin(r);
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (const [px, py] of [
		[b.x0, b.y0],
		[b.x1, b.y0],
		[b.x1, b.y1],
		[b.x0, b.y1]
	]) {
		const dx = px - cx;
		const dy = py - cy;
		const x = cx + dx * cos - dy * sin;
		const y = cy + dx * sin + dy * cos;
		x0 = Math.min(x0, x);
		y0 = Math.min(y0, y);
		x1 = Math.max(x1, x);
		y1 = Math.max(y1, y);
	}
	return { x0, y0, x1, y1 };
}

const num = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

function elementBounds(el: AnyElement): Bounds | null {
	switch (el.type) {
		case 'line':
		case 'arrow': {
			let reach = el.thickness / 2 + 2;
			if (el.type === 'arrow') reach += Math.max(el.headlen, el.tail ? el.taillen : 0);
			return {
				x0: Math.min(el.x1, el.x2) - reach,
				y0: Math.min(el.y1, el.y2) - reach,
				x1: Math.max(el.x1, el.x2) + reach,
				y1: Math.max(el.y1, el.y2) + reach
			};
		}
		case 'image': {
			const cx = (el.x1 + el.x2) / 2;
			const cy = (el.y1 + el.y2) / 2;
			const hw = Math.abs(el.x2 - el.x1) / 2 + 2;
			const hh = Math.abs(el.y2 - el.y1) / 2 + 2;
			return rotateBounds(
				{ x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh },
				cx,
				cy,
				el.rotation
			);
		}
		case 'rect': {
			const pad = (el.outline ? el.outlineWidth * 2 : 0) + 2;
			const cx = (el.x1 + el.x2) / 2;
			const cy = (el.y1 + el.y2) / 2;
			const hw = Math.abs(el.x2 - el.x1) / 2 + pad;
			const hh = Math.abs(el.y2 - el.y1) / 2 + pad;
			return rotateBounds(
				{ x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh },
				cx,
				cy,
				el.rotation
			);
		}
		case 'circle': {
			const pad = (el.outline ? el.outlineWidth / 2 : 0) + 2;
			const r = (el.rotation * Math.PI) / 180;
			const hx = Math.hypot(el.rx * Math.cos(r), el.ry * Math.sin(r)) + pad;
			const hy = Math.hypot(el.rx * Math.sin(r), el.ry * Math.cos(r)) + pad;
			return { x0: el.cx - hx, y0: el.cy - hy, x1: el.cx + hx, y1: el.cy + hy };
		}
		case 'draw': {
			if (!el.points.length) return null;
			let px0 = Infinity;
			let py0 = Infinity;
			let px1 = -Infinity;
			let py1 = -Infinity;
			for (const p of el.points) {
				px0 = Math.min(px0, p.x);
				py0 = Math.min(py0, p.y);
				px1 = Math.max(px1, p.x);
				py1 = Math.max(py1, p.y);
			}
			const d = smoothPath(el.points, {
				mode: el.smoothing ?? DSmooth,
				amount: DSmoothAmt,
				thickness: el.thickness
			});
			const nums = d.match(num) ?? [];
			let x0 = px0;
			let y0 = py0;
			let x1 = px1;
			let y1 = py1;
			for (let i = 0; i + 1 < nums.length; i += 2) {
				const x = Number(nums[i]);
				const y = Number(nums[i + 1]);
				if (x < x0) x0 = x;
				if (x > x1) x1 = x;
				if (y < y0) y0 = y;
				if (y > y1) y1 = y;
			}
			const pad = el.thickness / 2 + 2;
			return rotateBounds(
				{ x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad },
				(px0 + px1) / 2,
				(py0 + py1) / 2,
				el.rotation
			);
		}
		case 'text': {
			if (!el.text) return null;
			const t = textSize(el);
			const c = textCenter(el);
			const padX = el.fontSize * el.sx * 0.6 + 4;
			const padY = el.fontSize * el.sy * 0.6 + 4;
			return rotateBounds(
				{ x0: el.x - padX, y0: el.y - padY, x1: el.x + t.width + padX, y1: el.y + t.height + padY },
				c.x,
				c.y,
				el.rotation
			);
		}
		default:
			return null;
	}
}

export class LayerRenderer {
	private layers = new Map<string, Layer>();
	private counter = 0;
	private base: CanvasImageSource | null = null;
	private w = 0;
	private h = 0;

	clear() {
		for (const layer of this.layers.values()) this.dispose(layer);
		this.layers.clear();
	}

	private dispose(layer: Layer) {
		releaseCanvas(layer.canvas);
		releaseCanvas(layer.fx?.canvas);
		layer.canvas = null;
		layer.fx = null;
	}

	private signature(el: AnyElement, opts: LayerRenderOptions) {
		const sig = JSON.stringify(el);
		return el.type === 'text' ? `${sig}|${opts.epoch ?? 0}` : sig;
	}

	private rasterize(layer: Layer, el: AnyElement) {
		const b = elementBounds(el);
		const x0 = b ? Math.max(0, Math.floor(b.x0)) : 0;
		const y0 = b ? Math.max(0, Math.floor(b.y0)) : 0;
		const x1 = b ? Math.min(this.w, Math.ceil(b.x1)) : 0;
		const y1 = b ? Math.min(this.h, Math.ceil(b.y1)) : 0;
		const w = x1 - x0;
		const h = y1 - y0;

		if (!b || w < 1 || h < 1) {
			releaseCanvas(layer.canvas);
			layer.canvas = null;
			return;
		}

		const canvas = (layer.canvas ??= document.createElement('canvas'));
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
		}
		const g = getSceneContext(canvas);
		g.save();
		g.setTransform(1, 0, 0, 1, 0, 0);
		g.clearRect(0, 0, w, h);
		g.translate(-x0, -y0);
		drawElement(g, el, this.w, this.h);
		g.restore();
		layer.x = x0;
		layer.y = y0;
	}

	private drawEffect(
		ctx: CanvasRenderingContext2D,
		layer: Layer,
		el: EffectElement,
		under: string
	) {
		const region = snapRegion(el, this.w, this.h);
		if (!region) return;

		const key = `${layer.rev}|${under}`;
		const fx = layer.fx;
		if (fx?.ready && fx.key === key && fx.canvas) {
			ctx.clearRect(region.x, region.y, region.w, region.h);
			ctx.drawImage(fx.canvas, region.x, region.y);
			return;
		}

		if (el.type === 'blur') blurRegion(ctx, region, el.radius, this.w, this.h);
		else pixelateRegion(ctx, region, el.size);

		if (fx?.key === key) this.storeEffect(fx, ctx, region);
		else layer.fx = { key, canvas: fx?.canvas ?? null, ready: false };
	}

	private storeEffect(fx: NonNullable<Layer['fx']>, ctx: CanvasRenderingContext2D, r: Region) {
		const canvas = (fx.canvas ??= document.createElement('canvas'));
		if (canvas.width !== r.w || canvas.height !== r.h) {
			canvas.width = r.w;
			canvas.height = r.h;
		}
		const g = getSceneContext(canvas);
		g.clearRect(0, 0, r.w, r.h);
		g.drawImage(ctx.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
		fx.ready = true;
	}

	render(
		ctx: CanvasRenderingContext2D,
		base: CanvasImageSource,
		width: number,
		height: number,
		elements: AnyElement[],
		opts: LayerRenderOptions = {}
	) {
		if (base !== this.base || width !== this.w || height !== this.h) {
			this.clear();
			this.base = base;
			this.w = width;
			this.h = height;
		}

		const list = elements.filter((el) => el.id !== opts.skipId);

		const alive = new Set<string>();
		for (const el of list) {
			alive.add(el.id);
			let layer = this.layers.get(el.id);
			if (!layer) {
				layer = { sig: '', rev: 0, canvas: null, x: 0, y: 0, fx: null };
				this.layers.set(el.id, layer);
			}
			const sig = this.signature(el, opts);
			if (layer.sig === sig) continue;
			layer.sig = sig;
			layer.rev = ++this.counter;
			if (!isEffect(el)) this.rasterize(layer, el);
		}
		for (const [id, layer] of this.layers) {
			if (alive.has(id)) continue;
			this.dispose(layer);
			this.layers.delete(id);
		}

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = 1;
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, width, height);
		ctx.drawImage(base, 0, 0, width, height);

		let under = '';
		for (const el of list) {
			const layer = this.layers.get(el.id)!;
			if (isEffect(el)) this.drawEffect(ctx, layer, el, under);
			else if (layer.canvas) ctx.drawImage(layer.canvas, layer.x, layer.y);
			under += `${layer.rev},`;
		}
		ctx.restore();
	}
}

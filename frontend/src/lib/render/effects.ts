export type Region = { x: number; y: number; w: number; h: number };

export function snapRegion(
	el: { x1: number; y1: number; x2: number; y2: number },
	canvasW: number,
	canvasH: number
): Region | null {
	const x0 = Math.max(0, Math.round(Math.min(el.x1, el.x2)));
	const y0 = Math.max(0, Math.round(Math.min(el.y1, el.y2)));
	const x1 = Math.min(canvasW, Math.round(Math.max(el.x1, el.x2)));
	const y1 = Math.min(canvasH, Math.round(Math.max(el.y1, el.y2)));
	if (x1 - x0 < 1 || y1 - y0 < 1) return null;
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function pixelateRegion(ctx: CanvasRenderingContext2D, r: Region, size: number) {
	const s = Math.max(1, Math.round(size));
	const img = ctx.getImageData(r.x, r.y, r.w, r.h);
	const d = img.data;
	const right = r.x + r.w;
	const bottom = r.y + r.h;

	for (let cy = Math.floor(r.y / s) * s; cy < bottom; cy += s) {
		const y0 = Math.max(cy, r.y);
		const y1 = Math.min(cy + s, bottom);
		for (let cx = Math.floor(r.x / s) * s; cx < right; cx += s) {
			const x0 = Math.max(cx, r.x);
			const x1 = Math.min(cx + s, right);
			const n = (x1 - x0) * (y1 - y0);

			let sr = 0,
				sg = 0,
				sb = 0,
				sa = 0;
			for (let y = y0; y < y1; y++) {
				let i = ((y - r.y) * r.w + (x0 - r.x)) * 4;
				for (let x = x0; x < x1; x++, i += 4) {
					sr += d[i];
					sg += d[i + 1];
					sb += d[i + 2];
					sa += d[i + 3];
				}
			}
			const ar = Math.round(sr / n);
			const ag = Math.round(sg / n);
			const ab = Math.round(sb / n);
			const aa = Math.round(sa / n);

			for (let y = y0; y < y1; y++) {
				let i = ((y - r.y) * r.w + (x0 - r.x)) * 4;
				for (let x = x0; x < x1; x++, i += 4) {
					d[i] = ar;
					d[i + 1] = ag;
					d[i + 2] = ab;
					d[i + 3] = aa;
				}
			}
		}
	}
	ctx.putImageData(img, r.x, r.y);
}

function boxRadii(sigma: number): [number, number, number] {
	const n = 3;
	const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
	let wl = Math.floor(ideal);
	if (wl % 2 === 0) wl--;
	const wu = wl + 2;
	const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
	const size = (i: number) => (i < m ? wl : wu);
	return [(size(0) - 1) / 2, (size(1) - 1) / 2, (size(2) - 1) / 2];
}

function boxH(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number) {
	const n = 2 * r + 1;
	const half = n >> 1;
	const last = w - 1;
	for (let y = 0; y < h; y++) {
		const row = y * w * 4;
		for (let c = 0; c < 4; c++) {
			const o = row + c;
			let sum = src[o] * r;
			for (let i = 0; i <= r; i++) sum += src[o + Math.min(i, last) * 4];
			for (let x = 0; x < w; x++) {
				dst[o + x * 4] = ((sum + half) / n) | 0;
				sum += src[o + Math.min(x + r + 1, last) * 4] - src[o + Math.max(x - r, 0) * 4];
			}
		}
	}
}

function boxV(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number) {
	const n = 2 * r + 1;
	const half = n >> 1;
	const last = h - 1;
	const stride = w * 4;
	for (let x = 0; x < w; x++) {
		for (let c = 0; c < 4; c++) {
			const o = x * 4 + c;
			let sum = src[o] * r;
			for (let i = 0; i <= r; i++) sum += src[o + Math.min(i, last) * stride];
			for (let y = 0; y < h; y++) {
				dst[o + y * stride] = ((sum + half) / n) | 0;
				sum += src[o + Math.min(y + r + 1, last) * stride] - src[o + Math.max(y - r, 0) * stride];
			}
		}
	}
}


export function blurRegion(
	ctx: CanvasRenderingContext2D,
	r: Region,
	sigma: number,
	canvasW: number,
	canvasH: number
) {
	const radii = boxRadii(Math.max(0.5, sigma));
	const pad = radii[0] + radii[1] + radii[2];

	const ex0 = Math.max(0, r.x - pad);
	const ey0 = Math.max(0, r.y - pad);
	const ex1 = Math.min(canvasW, r.x + r.w + pad);
	const ey1 = Math.min(canvasH, r.y + r.h + pad);
	const ew = ex1 - ex0;
	const eh = ey1 - ey0;

	const img = ctx.getImageData(ex0, ey0, ew, eh);
	const a = img.data;
	const b = new Uint8ClampedArray(a.length);
	for (const rad of radii) {
		if (rad < 1) continue;
		boxH(a, b, ew, eh, rad);
		boxV(b, a, ew, eh, rad);
	}
	ctx.putImageData(img, ex0, ey0, r.x - ex0, r.y - ey0, r.w, r.h);
}

export type RGB = { r: number; g: number; b: number };
export type HSV = { h: number; s: number; v: number };

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export const round = (n: number, digits = 0) => {
	const f = 10 ** digits;
	return Math.round(n * f) / f;
};

export function hsvToRgb({ h, s, v }: HSV): RGB {
	const S = s / 100;
	const V = v / 100;
	const f = (n: number) => {
		const k = (n + h / 60) % 6;
		return V - V * S * Math.max(0, Math.min(k, 4 - k, 1));
	};
	return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 };
}

export function rgbToHsv({ r, g, b }: RGB, prev?: HSV): HSV {
	const R = r / 255;
	const G = g / 255;
	const B = b / 255;
	const max = Math.max(R, G, B);
	const min = Math.min(R, G, B);
	const d = max - min;

	let h = prev?.h ?? 0;
	if (d > 1e-9) {
		if (max === R) h = 60 * (((G - B) / d) % 6);
		else if (max === G) h = 60 * ((B - R) / d + 2);
		else h = 60 * ((R - G) / d + 4);
		if (h < 0) h += 360;
	}
	const s = max > 1e-9 ? (d / max) * 100 : (prev?.s ?? 0);
	return { h, s, v: max * 100 };
}

export function parseHex(input: string): { rgb: RGB; alpha?: number } | null {
	let s = input.trim();
	if (s.startsWith('#')) s = s.slice(1);
	if (!/^[0-9a-fA-F]+$/.test(s)) return null;
	if (s.length === 3 || s.length === 4) s = [...s].map((c) => c + c).join('');
	if (s.length !== 6 && s.length !== 8) return null;
	const byte = (i: number) => parseInt(s.slice(i, i + 2), 16);
	return {
		rgb: { r: byte(0), g: byte(2), b: byte(4) },
		alpha: s.length === 8 ? byte(6) / 255 : undefined
	};
}

export function formatHex(rgb: RGB, alpha?: number, hash = true): string {
	const h2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
	return (
		(hash ? '#' : '') +
		h2(rgb.r) +
		h2(rgb.g) +
		h2(rgb.b) +
		(alpha === undefined ? '' : h2(alpha * 255))
	);
}

export const toCss = ({ r, g, b }: RGB, alpha?: number) =>
	`rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)}${alpha === undefined ? '' : ` / ${alpha}`})`;

export const sameRgb = (a: RGB, b?: RGB) => !!b && a.r === b.r && a.g === b.g && a.b === b.b;
export const sameHsv = (a: HSV, b?: HSV) => !!b && a.h === b.h && a.s === b.s && a.v === b.v;

export const validRgb = (c: RGB) => [c.r, c.g, c.b].every(Number.isFinite);
export const validHsv = (c: HSV) => [c.h, c.s, c.v].every(Number.isFinite);

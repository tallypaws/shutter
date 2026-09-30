import type { TextElement } from './types';
import { TextLineHeight } from './defaults';
import { fontEpoch } from '$lib/fontEpoch.svelte';

export const quoteFamily = (f: string) => `"${f.replace(/["\\]/g, '\\$&')}"`;

const prefix = (el: TextElement) => `${el.italic ? 'italic ' : ''}${el.bold ? 700 : 400} `;
export const cssFont = (el: TextElement) =>
	`${prefix(el)}${el.fontSize}px/${TextLineHeight} ${quoteFamily(el.fontFamily)}, sans-serif`;
export const canvasFont = (el: TextElement) =>
	`${prefix(el)}${el.fontSize}px ${quoteFamily(el.fontFamily)}, sans-serif`;

let ctx: CanvasRenderingContext2D | null = null;

export function measureText(el: TextElement) {
	void fontEpoch.n;
	ctx ??= document.createElement('canvas').getContext('2d')!;
	ctx.font = canvasFont(el);
	const lines = el.text.split('\n');
	const width = Math.max(...lines.map((l) => ctx!.measureText(l).width));
	return { width, height: lines.length * el.fontSize * TextLineHeight };
}

export function textSize(el: TextElement) {
	const m = measureText(el);
	return { width: m.width * el.sx, height: m.height * el.sy, natural: m };
}

export function textCenter(el: TextElement) {
	const s = textSize(el);
	return { x: el.x + s.width / 2, y: el.y + s.height / 2 };
}

export function textTransform(el: TextElement): string {
	const c = textCenter(el);
	const rot = el.rotation ? `rotate(${el.rotation} ${c.x} ${c.y}) ` : '';
	return `${rot}translate(${el.x} ${el.y}) scale(${el.sx} ${el.sy})`;
}

<script lang="ts">
	import { clamp, hsvToRgb, toCss, type HSV } from './color.js';
	import ColorThumb from './color-thumb.svelte';
	import { arrowDelta, createDrag } from './drag.js';

	let { hsv = $bindable() }: { hsv: HSV } = $props();

	type Point = { x: number; y: number };

	const R = Math.PI / 180;
	const ringOuter = 0.5;
	const ringInner = 0.39;
	const ringMid = (ringOuter + ringInner) / 2;
	const triR = 0.34;

	function polar(deg: number, r: number): Point {
		return { x: 0.5 + r * Math.sin(deg * R), y: 0.5 - r * Math.cos(deg * R) };
	}

	const verts = $derived({
		hue: polar(hsv.h, triR),
		white: polar(hsv.h + 120, triR),
		black: polar(hsv.h + 240, triR)
	});

	const thumb = $derived.by(() => {
		const s = hsv.s / 100;
		const v = hsv.v / 100;
		const wh = s * v;
		const ww = (1 - s) * v;
		const wb = 1 - v;
		return {
			x: (wh * verts.hue.x + ww * verts.white.x + wb * verts.black.x) * 100,
			y: (wh * verts.hue.y + ww * verts.white.y + wb * verts.black.y) * 100
		};
	});
	const ringThumb = $derived(polar(hsv.h, ringMid));

	const thumbColor = $derived(toCss(hsvToRgb(hsv)));
	const hueColor = $derived(`hsl(${hsv.h} 100% 50%)`);

	const triangleStyle = $derived.by(() => {
		const { hue, white, black } = verts;
		const clip = [hue, white, black].map((p) => `${p.x * 100}% ${p.y * 100}%`).join(', ');

		const stops: string[] = [];
		for (let i = 0; i <= 8; i++) {
			const t = 1 - i / 8; 
			const deg = 60 - Math.atan2(Math.sin(Math.PI / 3) * t, 1 - 0.5 * t) / R;
			stops.push(`color-mix(in srgb, ${hueColor} ${t * 100}%, white) ${deg.toFixed(2)}deg`);
		}

		const angle = hsv.h + 60;
		const len = Math.abs(Math.sin(angle * R)) + Math.abs(Math.cos(angle * R));
		const start = 50 - (triR / len) * 100;
		const end = 50 + (triR / 2 / len) * 100;

		return (
			`clip-path: polygon(${clip}); ` +
			`background: linear-gradient(${angle}deg, #000 ${start}%, transparent ${end}%), ` +
			`conic-gradient(from ${hsv.h + 30}deg at ${black.x * 100}% ${black.y * 100}%, ${stops.join(', ')});`
		);
	});

	const ringMask = `radial-gradient(farthest-side, transparent ${(ringInner / ringOuter) * 100 - 0.5}%, #000 ${(ringInner / ringOuter) * 100}%)`;

	function barycentric(p: Point, a: Point, b: Point, c: Point) {
		const v0 = { x: b.x - a.x, y: b.y - a.y };
		const v1 = { x: c.x - a.x, y: c.y - a.y };
		const v2 = { x: p.x - a.x, y: p.y - a.y };
		const d = v0.x * v1.y - v1.x * v0.y;
		const wb = (v2.x * v1.y - v1.x * v2.y) / d;
		const wc = (v0.x * v2.y - v2.x * v0.y) / d;
		return { wa: 1 - wb - wc, wb, wc };
	}

	let mode: 'ring' | 'triangle' = 'triangle';

	const drag = createDrag(({ x, y, start }) => {
		const dx = x - 0.5;
		const dy = y - 0.5;
		if (start) mode = Math.hypot(dx, dy) > ringInner - 0.005 ? 'ring' : 'triangle';

		if (mode === 'ring') {
			let h = Math.atan2(dx, -dy) / R;
			if (h < 0) h += 360;
			hsv = { h, s: hsv.s, v: hsv.v };
			return;
		}

		const { wa, wb, wc } = barycentric({ x, y }, verts.hue, verts.white, verts.black);
		const a = Math.max(0, wa);
		const b = Math.max(0, wb);
		const c = Math.max(0, wc);
		const sum = a + b + c || 1;
		const v = (a + b) / sum;
		hsv = { h: hsv.h, s: v > 1e-6 ? (a / sum / v) * 100 : hsv.s, v: v * 100 };
	});

	function onkeydown(e: KeyboardEvent) {
		const d = arrowDelta(e);
		if (!d) return;
		e.preventDefault();
		hsv = {
			h: (((hsv.h + d.dx) % 360) + 360) % 360,
			s: hsv.s,
			v: clamp(hsv.v + d.dy, 0, 100)
		};
	}
</script>

<div
	data-slot="color-area"
	role="slider"
	tabindex="0"
	aria-label="Hue, saturation and brightness"
	aria-valuenow={Math.round(hsv.h)}
	aria-valuetext="Hue {Math.round(hsv.h)}°, saturation {Math.round(hsv.s)}%, brightness {Math.round(
		hsv.v
	)}%"
	class="relative aspect-square w-full cursor-crosshair touch-none rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
	{...drag}
	{onkeydown}
>
	<div
		class="pointer-events-none absolute inset-0 rounded-full"
		style="background: conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); -webkit-mask: {ringMask}; mask: {ringMask};"
	></div>
	<div class="pointer-events-none absolute inset-0" style={triangleStyle}></div>
	<ColorThumb x={ringThumb.x * 100} y={ringThumb.y * 100} color={hueColor} />
	<ColorThumb x={thumb.x} y={thumb.y} color={thumbColor} />
</div>

<script lang="ts">
	import { clamp, hsvToRgb, toCss, type HSV } from './color.js';
	import ColorThumb from './color-thumb.svelte';
	import { arrowDelta, createDrag } from './drag.js';

	let { hsv = $bindable() }: { hsv: HSV } = $props();

	const R = Math.PI / 180;

	const thumbColor = $derived(toCss(hsvToRgb(hsv)));
	const thumb = $derived.by(() => {
		const r = (hsv.s / 100) * 50;
		return { x: 50 + r * Math.sin(hsv.h * R), y: 50 - r * Math.cos(hsv.h * R) };
	});

	const drag = createDrag(({ x, y }) => {
		const dx = x - 0.5;
		const dy = y - 0.5;
		const r = Math.min(Math.hypot(dx, dy) / 0.5, 1);
		let h = hsv.h;
		if (r > 0.01) {
			h = Math.atan2(dx, -dy) / R;
			if (h < 0) h += 360;
		}
		hsv = { h, s: r * 100, v: hsv.v };
	});

	function onkeydown(e: KeyboardEvent) {
		const d = arrowDelta(e);
		if (!d) return;
		e.preventDefault();
		hsv = {
			h: (((hsv.h + d.dx) % 360) + 360) % 360,
			s: clamp(hsv.s + d.dy, 0, 100),
			v: hsv.v
		};
	}
</script>

<div
	data-slot="color-area"
	role="slider"
	tabindex="0"
	aria-label="Hue and saturation"
	aria-valuenow={Math.round(hsv.h)}
	aria-valuetext="Hue {Math.round(hsv.h)}°, saturation {Math.round(hsv.s)}%"
	class="relative aspect-square w-full cursor-crosshair touch-none rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
	{...drag}
	{onkeydown}
>
	<div
		class="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
		style="background: radial-gradient(closest-side, #fff, transparent), conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);"
	>
		<div class="absolute inset-0 bg-black" style="opacity: {1 - hsv.v / 100}"></div>
	</div>
	<ColorThumb x={thumb.x} y={thumb.y} color={thumbColor} />
</div>

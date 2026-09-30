<script lang="ts">
	import { clamp, hsvToRgb, toCss, type HSV } from './color.js';
	import ColorThumb from './color-thumb.svelte';
	import { arrowDelta, createDrag } from './drag.js';

	let { hsv = $bindable() }: { hsv: HSV } = $props();

	const thumbColor = $derived(toCss(hsvToRgb(hsv)));

	const drag = createDrag(({ x, y }) => {
		hsv = { h: hsv.h, s: clamp(x, 0, 1) * 100, v: (1 - clamp(y, 0, 1)) * 100 };
	});

	function onkeydown(e: KeyboardEvent) {
		const d = arrowDelta(e);
		if (!d) return;
		e.preventDefault();
		hsv = { h: hsv.h, s: clamp(hsv.s + d.dx, 0, 100), v: clamp(hsv.v + d.dy, 0, 100) };
	}
</script>

<div
	data-slot="color-area"
	role="slider"
	tabindex="0"
	aria-label="Saturation and brightness"
	aria-valuenow={Math.round(hsv.s)}
	aria-valuetext="Saturation {Math.round(hsv.s)}%, brightness {Math.round(hsv.v)}%"
	class="relative aspect-square w-full cursor-crosshair touch-none rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
	style="background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl({hsv.h} 100% 50%));"
	{...drag}
	{onkeydown}
>
	<ColorThumb x={hsv.s} y={100 - hsv.v} color={thumbColor} />
</div>

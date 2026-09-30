<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { clamp, round } from './color.js';
	import ColorThumb from './color-thumb.svelte';
	import { arrowDelta, createDrag } from './drag.js';

	let {
		value,
		min = 0,
		max = 1,
		step = 0.01,
		label,
		trackStyle,
		thumbColor,
		class: className,
		onValueChange
	}: {
		value: number;
		min?: number;
		max?: number;
		step?: number;
		label: string;
		trackStyle: string;
		thumbColor: string;
		class?: string;
		onValueChange: (value: number) => void;
	} = $props();

	const fraction = $derived((value - min) / (max - min));

	const drag = createDrag(({ x }) => {
		onValueChange(min + clamp(x, 0, 1) * (max - min));
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Home') {
			e.preventDefault();
			onValueChange(min);
			return;
		}
		if (e.key === 'End') {
			e.preventDefault();
			onValueChange(max);
			return;
		}
		const d = arrowDelta(e);
		if (!d) return;
		e.preventDefault();
		onValueChange(clamp(value + (d.dx + d.dy) * step, min, max));
	}
</script>

<div
	data-slot="color-slider"
	role="slider"
	tabindex="0"
	aria-label={label}
	aria-valuemin={min}
	aria-valuemax={max}
	aria-valuenow={round(value, 2)}
	class={cn(
		'relative h-3 w-full cursor-pointer touch-none rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
		className
	)}
	style={trackStyle}
	{...drag}
	{onkeydown}
>
	<ColorThumb x={fraction * 100} color={thumbColor} />
</div>

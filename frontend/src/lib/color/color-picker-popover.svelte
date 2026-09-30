<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { cn } from '$lib/utils.js';
	import {
		clamp,
		hsvToRgb,
		parseHex,
		toCss,
		validHsv,
		validRgb,
		type HSV,
		type RGB
	} from './color.js';
	import ColorPicker, { type ColorPickerType } from './color-picker.svelte';

	type Props = Omit<
		ComponentProps<typeof Popover.Trigger>,
		'children' | 'child' | 'ref' | 'type'
	> & {
		ref?: HTMLButtonElement | null;
		open?: boolean;
		type?: ColorPickerType;
		rgb?: RGB;
		hsv?: HSV;
		hex?: string;
		opacity?: number | null;
		side?: ComponentProps<typeof Popover.Content>['side'];
		align?: ComponentProps<typeof Popover.Content>['align'];
		sideOffset?: number;
		contentClass?: string;
	};

	let {
		ref = $bindable(null),
		open = $bindable(false),
		class: className,
		type = 'square',
		rgb = $bindable(),
		hsv = $bindable(),
		hex = $bindable(),
		opacity = $bindable(null),
		side,
		align = 'center',
		sideOffset,
		contentClass,
		disabled,
		...restProps
	}: Props = $props();

	const CHECKER = 'repeating-conic-gradient(#9994 0% 25%, transparent 0% 50%)';


	const swatchStyle = $derived.by(() => {
		const parsed = hex ? parseHex(hex) : null;

		let color: RGB = { r: 255, g: 0, b: 0 }; 
		if (hsv && validHsv(hsv)) color = hsvToRgb(hsv);
		else if (rgb && validRgb(rgb)) color = { r: rgb.r, g: rgb.g, b: rgb.b };
		else if (parsed) color = parsed.rgb;

		const alpha =
			opacity != null && Number.isFinite(opacity) ? clamp(opacity, 0, 1) : parsed?.alpha;

		const fill = toCss(color, alpha);
		return `background-image: linear-gradient(${fill}, ${fill}), ${CHECKER}; background-size: 100% 100%, 10px 10px;`;
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		bind:ref
		{disabled}
		aria-label="Pick a color"
		data-slot="color-picker-trigger"
		class={cn(
			'inline-block size-6 shrink-0 cursor-pointer rounded-md border border-foreground/15 align-middle transition-shadow outline-none',
			'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
			'disabled:pointer-events-none disabled:opacity-50',
			className
		)}
		style={swatchStyle}
		{...restProps}
	/>
	<Popover.Content class={cn('w-auto rounded-lg p-0', contentClass)} {side} {align} {sideOffset}>
		<ColorPicker
			{type}
			bind:rgb
			bind:hsv
			bind:hex
			bind:opacity
			class="border-0 bg-transparent shadow-none"
		/>
	</Popover.Content>
</Popover.Root>

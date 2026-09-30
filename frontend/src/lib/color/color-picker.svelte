<script lang="ts" module>
	export type ColorPickerType = 'square' | 'circle' | 'triangle';
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import {
		clamp,
		formatHex,
		hsvToRgb,
		parseHex,
		rgbToHsv,
		round,
		sameRgb,
		toCss,
		validHsv,
		validRgb,
		type HSV,
		type RGB
	} from './color.js';
	import ColorAreaCircle from './color-area-circle.svelte';
	import ColorAreaSquare from './color-area-square.svelte';
	import ColorAreaTriangle from './color-area-triangle.svelte';
	import ColorField from './color-field.svelte';
	import ColorSlider from './color-slider.svelte';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		type?: ColorPickerType;
		rgb?: RGB;
		hsv?: HSV;
		hex?: string;
		opacity?: number | null;
	};

	let {
		ref = $bindable(null),
		class: className,
		type = 'square',
		rgb = $bindable(),
		hsv = $bindable(),
		hex = $bindable(),
		opacity = $bindable(null),
		...restProps
	}: Props = $props();

	const modes = ['hex', 'rgb', 'hsv'] as const;
	const checkerboard = 'repeating-conic-gradient(#9994 0% 25%, transparent 0% 50%)';

	function roundRgb({ r, g, b }: RGB): RGB {
		return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
	}

	function clampRgb({ r, g, b }: RGB): RGB {
		return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) };
	}

	function clampHsv({ h, s, v }: HSV): HSV {
		return { h: clamp(h, 0, 360), s: clamp(s, 0, 100), v: clamp(v, 0, 100) };
	}

	function closeHsv(a: HSV, b: HSV) {
		return (
			round(a.h % 360, 2) === round(b.h % 360, 2) &&
			round(a.s, 2) === round(b.s, 2) &&
			round(a.v, 2) === round(b.v, 2)
		);
	}

	function num(raw: string) {
		const n = Number(raw);
		return raw.trim() !== '' && Number.isFinite(n) ? n : null;
	}

	function hexMatches(str: string, rgbInt: RGB, a: number | null) {
		const parsed = parseHex(str);
		if (!parsed || !sameRgb(parsed.rgb, rgbInt)) return false;
		if (a === null) return parsed.alpha === undefined;
		return parsed.alpha !== undefined && Math.round(parsed.alpha * 255) === Math.round(a * 255);
	}

	function initialColor(): HSV {
		if (hsv && validHsv(hsv)) return clampHsv(hsv);
		if (rgb && validRgb(rgb)) return rgbToHsv(clampRgb(rgb));
		const parsed = hex ? parseHex(hex) : null;
		if (parsed) return rgbToHsv(parsed.rgb);
		return { h: 0, s: 100, v: 100 };
	}

	function initialAlpha(): number | null {
		if (opacity != null && Number.isFinite(opacity)) return clamp(opacity, 0, 1);
		const parsed = hex ? parseHex(hex) : null;
		return parsed?.alpha ?? null;
	}

	function initialHash() {
		return hex ? hex.trim().startsWith('#') : true;
	}

	let color = $state.raw<HSV>(initialColor());
	let alpha = $state.raw<number | null>(initialAlpha());
	let hexHash = initialHash();

	let mode = $state<(typeof modes)[number]>('hex');

	const currentRgb = $derived(hsvToRgb(color));
	const rgbInt = $derived(roundRgb(currentRgb));
	const css = $derived(toCss(currentRgb));
	const currentHex = $derived(formatHex(currentRgb, alpha ?? undefined));

	function adoptRgb(next: RGB | undefined) {
		if (!next || !validRgb(next)) return;
		const c = clampRgb(next);
		if (sameRgb(roundRgb(c), roundRgb(hsvToRgb(color)))) return;
		color = rgbToHsv(c, color);
	}

	function adoptHsv(next: HSV | undefined) {
		if (!next || !validHsv(next)) return;
		const c = clampHsv(next);
		if (closeHsv(c, color)) return;
		color = c;
	}

	function applyParsedHex(parsed: NonNullable<ReturnType<typeof parseHex>>) {
		if (!sameRgb(parsed.rgb, roundRgb(hsvToRgb(color)))) color = rgbToHsv(parsed.rgb, color);
		if (
			parsed.alpha !== undefined &&
			(alpha === null || Math.round(alpha * 255) !== Math.round(parsed.alpha * 255))
		) {
			alpha = parsed.alpha;
		}
	}

	function adoptHex(next: string | undefined) {
		if (typeof next !== 'string') return;
		const parsed = parseHex(next);
		if (!parsed) return;
		hexHash = next.trim().startsWith('#');
		applyParsedHex(parsed);
	}

	function adoptOpacity(next: number | null | undefined) {
		if (next == null) {
			if (alpha !== null) alpha = null;
			return;
		}
		if (!Number.isFinite(next)) return;
		const a = clamp(next, 0, 1);
		if (alpha === null || round(alpha, 2) !== round(a, 2)) alpha = a;
	}

	$effect(() => {
		const c = color;
		const a = alpha;
		untrack(() => {
			const nextRgb = roundRgb(hsvToRgb(c));
			if (!rgb || !validRgb(rgb) || !sameRgb(roundRgb(rgb), nextRgb)) rgb = nextRgb;

			if (!hsv || !validHsv(hsv) || !closeHsv(hsv, c)) {
				hsv = { h: round(c.h, 2), s: round(c.s, 2), v: round(c.v, 2) };
			}

			if (!hex || !hexMatches(hex, nextRgb, a)) hex = formatHex(nextRgb, a ?? undefined, hexHash);

			const nextOpacity = a === null ? null : round(a, 2);
			const currentOpacity = opacity == null ? null : round(opacity, 2);
			if (currentOpacity !== nextOpacity) opacity = nextOpacity;
		});
	});

	$effect(() => {
		const next = rgb && { r: rgb.r, g: rgb.g, b: rgb.b };
		untrack(() => adoptRgb(next));
	});
	$effect(() => {
		const next = hsv && { h: hsv.h, s: hsv.s, v: hsv.v };
		untrack(() => adoptHsv(next));
	});
	$effect(() => {
		const next = hex;
		untrack(() => adoptHex(next));
	});
	$effect(() => {
		const next = opacity;
		untrack(() => adoptOpacity(next));
	});

	function commitRgb(key: keyof RGB, raw: string) {
		const n = num(raw);
		if (n === null) return;
		color = rgbToHsv({ ...rgbInt, [key]: clamp(n, 0, 255) }, color);
	}

	function commitHsv(key: keyof HSV, raw: string) {
		const n = num(raw);
		if (n === null) return;
		color = { ...color, [key]: clamp(n, 0, key === 'h' ? 360 : 100) };
	}

	function commitAlpha(raw: string) {
		const n = num(raw);
		if (n === null) return;
		alpha = clamp(n / 100, 0, 1);
	}

	function commitHex(raw: string) {
		const parsed = parseHex(raw);
		if (!parsed) return;
		applyParsedHex(parsed);
	}


	const hueTrack =
		'background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);';
	const valueTrack = $derived(
		`background: linear-gradient(to right, #000, ${toCss(hsvToRgb({ h: color.h, s: color.s, v: 100 }))});`
	);
	const alphaTrack = $derived(
		`background-image: linear-gradient(to right, transparent, ${css}), ${checkerboard}; background-size: 100% 100%, 10px 10px;`
	);
	const swatchStyle = $derived(
		`background-image: linear-gradient(${toCss(currentRgb, alpha ?? undefined)}, ${toCss(currentRgb, alpha ?? undefined)}), ${checkerboard}; background-size: 100% 100%, 10px 10px;`
	);
</script>

<div
	bind:this={ref}
	data-slot="color-picker"
	class={cn(
		'flex w-64 flex-col gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-xs select-none',
		className
	)}
	{...restProps}
>
	{#if type === 'circle'}
		<ColorAreaCircle bind:hsv={color} />
		<ColorSlider
			label="Brightness"
			value={color.v}
			min={0}
			max={100}
			step={1}
			trackStyle={valueTrack}
			thumbColor={css}
			onValueChange={(v) => (color = { ...color, v })}
		/>
	{:else if type === 'triangle'}
		<ColorAreaTriangle bind:hsv={color} />
	{:else}
		<ColorAreaSquare bind:hsv={color} />
		<ColorSlider
			label="Hue"
			value={color.h}
			min={0}
			max={360}
			step={1}
			trackStyle={hueTrack}
			thumbColor="hsl({color.h} 100% 50%)"
			onValueChange={(h) => (color = { ...color, h })}
		/>
	{/if}

	{#if alpha !== null}
		<ColorSlider
			label="Opacity"
			value={alpha}
			min={0}
			max={1}
			step={0.01}
			trackStyle={alphaTrack}
			thumbColor={css}
			onValueChange={(a) => (alpha = a)}
		/>
	{/if}

	<div class="flex flex-col gap-2">
		<div class="flex items-center gap-1.5">
			<div
				class="size-8 shrink-0 rounded-md border border-foreground/10"
				style={swatchStyle}
				aria-hidden="true"
			></div>
			{#each modes as m (m)}
				<Button
					type="button"
					size="sm"
					variant={mode === m ? 'secondary' : 'ghost'}
					class="h-8 flex-1 px-2 text-xs uppercase"
					onclick={() => (mode = m)}
				>
					{m}
				</Button>
			{/each}
		</div>

		{#if mode === 'hex'}
			<ColorField label="Hex" value={currentHex} oncommit={commitHex} />
		{:else if mode === 'rgb'}
			<div class={cn('grid gap-1.5', alpha === null ? 'grid-cols-3' : 'grid-cols-4')}>
				<ColorField label="R" value={String(rgbInt.r)} step={1} min={0} max={255} oncommit={(raw) => commitRgb('r', raw)} />
				<ColorField label="G" value={String(rgbInt.g)} step={1} min={0} max={255} oncommit={(raw) => commitRgb('g', raw)} />
				<ColorField label="B" value={String(rgbInt.b)} step={1} min={0} max={255} oncommit={(raw) => commitRgb('b', raw)} />
				{#if alpha !== null}
					<ColorField label="A %" value={String(Math.round(alpha * 100))} step={1} min={0} max={100} oncommit={commitAlpha} />
				{/if}
			</div>
		{:else}
			<div class={cn('grid gap-1.5', alpha === null ? 'grid-cols-3' : 'grid-cols-4')}>
				<ColorField label="H" value={String(Math.round(color.h))} step={1} min={0} max={360} oncommit={(raw) => commitHsv('h', raw)} />
				<ColorField label="S" value={String(Math.round(color.s))} step={1} min={0} max={100} oncommit={(raw) => commitHsv('s', raw)} />
				<ColorField label="V" value={String(Math.round(color.v))} step={1} min={0} max={100} oncommit={(raw) => commitHsv('v', raw)} />
				{#if alpha !== null}
					<ColorField label="A %" value={String(Math.round(alpha * 100))} step={1} min={0} max={100} oncommit={commitAlpha} />
				{/if}
			</div>
		{/if}
	</div>
</div>

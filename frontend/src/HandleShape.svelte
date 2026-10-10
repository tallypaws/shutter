<script lang="ts">
	import type { ElementHandle } from '$lib/tools/types';
	import { RotateHandleOffset } from '$lib/tools/defaults';

	let {
		handle,
		cursor,
		onpointerdown
	}: { handle: ElementHandle; cursor: string; onpointerdown: (e: PointerEvent) => void } = $props();

	const arm = 10;
	const ax = $derived(-(handle.dir?.x ?? 1) * arm);
	const ay = $derived(-(handle.dir?.y ?? 1) * arm);
	const bracket = $derived(`M ${ax} 0 H 0 V ${ay}`);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g
	transform={`translate(${handle.x} ${handle.y}) rotate(${handle.rotation ?? 0})`}
	style:cursor
	{onpointerdown}
	fill="white"
	stroke="#aaa"
	stroke-width="2"
>
	{#if handle.kind === 'corner'}
		<path
			d={bracket}
			fill="none"
			stroke="#aaa"
			stroke-width="8"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<path
			d={bracket}
			fill="none"
			stroke="white"
			stroke-width="4"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	{:else if handle.kind === 'horizontal'}
		<rect x="-11" y="-4.5" width="22" height="9" rx="4.5" />
	{:else if handle.kind === 'vertical'}
		<rect x="-4.5" y="-11" width="9" height="22" rx="4.5" />
	{:else if handle.kind === 'radius'}
		<path d="M 0 -8 L 8 0 L 0 8 L -8 0 Z" fill="#60a5fa" stroke-linejoin="round" />
	{:else if handle.kind === 'rotate'}
		<line
			x1="0"
			y1="0"
			x2="0"
			y2={RotateHandleOffset}
			stroke="#aaa"
			stroke-width="1.5"
			pointer-events="none"
		/>
		<circle r="8" fill="#60a5fa" />
		<path
			d="M -3.5 0.5 A 3.5 3.5 0 1 1 0 3.5"
			fill="none"
			stroke="white"
			stroke-width="1.8"
			stroke-linecap="round"
		/>
	{:else if handle.kind === 'head'}
		<path d="M 0 -8 L 8 6 L -8 6 Z" stroke-linejoin="round" />
	{:else}
		<circle r="7" />
	{/if}
</g>

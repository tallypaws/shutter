<script lang="ts">
	import { fade } from 'svelte/transition';
	import { attachDomTooltips, flash, place, tooltips, trackPointer } from './tooltip.svelte.js';

	let { dom = true }: {dom?: boolean } =
		$props();

	$effect(() => trackPointer());

	$effect(() => {
		if (!dom) return;
		return attachDomTooltips();
	});
</script>

{#each tooltips.items as item (item.id)}
	<div
		class="tooltip {item.class ?? ''} select-none pointer-events-none"
		role="tooltip"
		use:place={item.id}
		use:flash={item.rev}
		transition:fade={{ duration: 120 }}
	>
		{#if typeof item.content === 'string'}
			{item.content}
		{:else}
			{@render item.content()}
		{/if}
	</div>
{/each}

<style>
	.tooltip {
		position: fixed;
		left: 0;
		top: 0;
		width: max-content;
		max-width: min(360px, calc(100vw - 8px));
		padding: 2px 10px;
		border-radius: 3px;
		background: var(--tooltip-bg, rgb(40, 40, 40));
		color: white;
		white-space: pre-line;
		pointer-events: none;
		will-change: transform;
		z-index: 10000;
	}
</style>
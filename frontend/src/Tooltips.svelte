<script lang="ts">
	import { fade } from 'svelte/transition';
	import { attachDomTooltips, flash, place, tooltips, trackPointer } from './tooltip.svelte.js';

	let { dom = true }: { dom?: boolean } = $props();

	$effect(() => trackPointer());

	$effect(() => {
		if (!dom) return;
		return attachDomTooltips();
	});
</script>

{#each tooltips.items as item (item.id)}
	{@const bare = item.bare && typeof item.content !== 'string'}
	<div
		class="tooltip {item.class ?? ''} select-none pointer-events-none"
		class:box={!bare}
		role="tooltip"
		use:place={item.id}
		use:flash={bare ? null : item.rev}
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
		pointer-events: none;
		will-change: transform;
		z-index: 10000;
	}

	.tooltip.box {
		max-width: min(360px, calc(100vw - 8px));
		padding: 2px 10px;
		border-radius: 3px;
		background: var(--tooltip-bg, var(--popover));
		color: var(--popover-foreground);
		white-space: pre-line;
	}
</style>

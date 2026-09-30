<script lang="ts">
	let { x, y = 50, color }: { x: number; y?: number; color: string } = $props();
</script>

<div
	data-slot="color-thumb"
	class="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.35),0_1px_3px_rgb(0_0_0/0.4)]"
	style="left: {x}%; top: {y}%; background: {color}"
></div>

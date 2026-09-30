<script lang="ts">
	import { Checkbox as CheckboxPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';
	import { Check, Minus } from '@lucide/svelte';
	import { fly, scale } from 'svelte/transition';

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		indeterminate = $bindable(false),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props();
</script>

<CheckboxPrimitive.Root
	bind:ref
	bind:checked
	bind:indeterminate
	data-slot="checkbox"
	class={cn(
		'border-input bg-input/50 data-checked:bg-primary data-checked:text-primary-foreground data-checked:border-primary focus-visible:border-ring focus-visible:ring-ring/30 peer flex size-4 shrink-0 items-center justify-center rounded-lg border outline-none transition-colors focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...restProps}
>
	{#snippet children({ checked, indeterminate })}
		{#if indeterminate}
			<Minus class="size-3" />
		{:else if checked}
			<span transition:scale>
				<Check class="size-3" />
			</span>
		{/if}
	{/snippet}
</CheckboxPrimitive.Root>

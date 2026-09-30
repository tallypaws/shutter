<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';
	import { fonts, loadFonts } from '$lib/fonts.svelte';
	import { quoteFamily } from '$lib/tools/text';
	import { onMount } from 'svelte';

	let { value = $bindable() }: { value: string } = $props();
	onMount(loadFonts);

	const familyStyle = (name: string) => `font-family: ${quoteFamily(name)}, sans-serif`;
	const items = $derived(fonts.list.map((f) => ({ value: f, label: f })));
</script>

<Select.Root type="single" bind:value {items}>
	<Select.Trigger class="w-45" style={familyStyle(value)}>{value}</Select.Trigger>
	<Select.Content class="max-h-80">
		{#each fonts.list as name (name)}
			<Select.Item value={name} label={name} style={familyStyle(name)}>{name}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>

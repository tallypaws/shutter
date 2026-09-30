<script lang="ts">
	import { cn } from '$lib/utils';
	import { Slider } from '$lib/components/ui/slider';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Separator } from '$lib/components/ui/separator';
	import * as Select from '$lib/components/ui/select/index.js';
	import ColorPickerPopover from '$lib/color/color-picker-popover.svelte';
	import FontSelect from './FontSelect.svelte';
	import type { NumberOptionField, ToolOptionField } from '$lib/tools/types';

	let {
		fields,
		get,
		set
	}: {
		fields: ToolOptionField[];
		get: (key: string) => unknown;
		set: (key: string, value: unknown) => void;
	} = $props();

	function setNumber(field: NumberOptionField, raw: unknown) {
		if (raw === '' || raw == null) return;
		const n = Number(raw);
		if (!Number.isFinite(n)) return;
		set(field.key, Math.min(field.max, Math.max(field.min, n)));
	}
</script>

{#each fields as field, i (field.type === 'separator' ? `sep-${i}` : field.key)}
	{#if field.type === 'separator'}
		<Separator orientation="vertical" class="my-2" />
	{:else}
		{const disabled = $derived(!!field.enabledBy && !get(field.enabledBy))}
		<label
			class={cn(
				'flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity',
				disabled && 'pointer-events-none opacity-40'
			)}
		>
			{#if field.type === 'checkbox'}
				<Checkbox
					checked={!!get(field.key)}
					onCheckedChange={(v) => set(field.key, v)}
					{disabled}
				/>
				{#if field.label}{field.label}{/if}
			{:else if field.type === 'color'}
				{#if field.label}{field.label}{/if}
				<!-- <input
					type="color"
					value={get(field.key) as string}
					oninput={(event) => set(field.key, event.currentTarget.value)}
					{disabled}
					class="h-6 w-6 cursor-pointer rounded-md border-0 bg-transparent p-0"
				/> -->
				<ColorPickerPopover
					bind:hex={
						() => get(field.key) as string, (v) => set(field.key, v)
					}
					type="triangle"
					opacity={100}
				/>
			{:else if field.type === 'select'}
				{#if field.label}{field.label}{/if}

				<Select.Root
					type="single"
					items={field.options}
					bind:value={
						() => get(field.key) as string, (v) => set(field.key, v)
					}
				>
					<Select.Trigger class="w-45">
						<Select.Value placeholder={field.placeholder} />
					</Select.Trigger>
					<Select.Content>
						{#each field.options as option (option.value)}
							<Select.Item value={option.value} label={option.label}>
								{option.label}
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			{:else if field.type === 'number'}
				{#if field.label}{field.label}{/if}
				{#if field.slider !== false}
					<Slider
						min={field.min}
						max={field.max}
						step={field.step ?? 1}
						type="single"
						bind:value={
							() => get(field.key) as number,
							(v) => set(field.key, v)
						}
						class="w-24 accent-primary"
					/>
				{/if}
				<Input
					type="number"
					min={field.min}
					max={field.max}
					step={field.step ?? 1}
					value={get(field.key) as number}
					onchange={(event) => setNumber(field, event.currentTarget.value)}
					{disabled}
					class="h-6 w-14 rounded-lg px-1.5 text-right text-xs tabular-nums"
				/>
				{#if field.unit}{field.unit}{/if}
			{:else if field.type === 'font'}
				<FontSelect
					bind:value={
						() => get(field.key) as string, (v) => set(field.key, v)
					}
				/>
			{/if}
		</label>
	{/if}
{/each}

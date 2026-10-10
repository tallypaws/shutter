<script lang="ts">
	import { cn } from '$lib/utils';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import { Settings as SettingsIcon } from '@lucide/svelte';
	import {
		actionLabel,
		actionSmall,
		saveActionIds,
		saveIcons,
		type SaveActionId,
		type SaveActionSetting
	} from '$lib/settings.svelte';
	import { tooltip } from '../../tooltip.svelte';

	let {
		actions,
		onaction,
		onsettings,
		inert = false
	}: {
		actions: Record<SaveActionId, SaveActionSetting>;
		onaction?: (id: SaveActionId) => void;
		onsettings?: () => void;
		inert?: boolean;
	} = $props();

	const saves = $derived(saveActionIds.filter((id) => id !== 'cancel' && actions[id].visible));
	const showCancel = $derived(actions.cancel.visible);
</script>

<div
	class={cn(
		'h-10 bg-popover px-2 rounded-xl outline flex flex-row justify-center items-center gap-1',
		inert && 'pointer-events-none'
	)}
>
	{#each saves as id (id)}
		{const Icon = $derived(saveIcons[actions[id].icon])}
		<span use:tooltip={actionSmall(id, actions) ? [actionLabel(id, actions)] : []}>
			<Button
				variant="secondary"
				onclick={() => onaction?.(id)}
				size={actionSmall(id, actions) ? 'icon' : 'default'}
			>
				<Icon />
				{#if !actionSmall(id, actions)}
					{actionLabel(id, actions)}
				{/if}
			</Button>
		</span>
	{/each}
	{#if showCancel}
		{#if saves.length > 0}
			<Separator orientation="vertical" class="my-2" />
		{/if}
		{const Icon = $derived(saveIcons[actions.cancel.icon])}
		<span use:tooltip={actionSmall('cancel', actions) ? [actionLabel('cancel', actions)] : []}>
			<Button
				variant="secondary"
				title={actionLabel('cancel', actions)}
				onclick={() => onaction?.('cancel')}
				size={actionSmall('cancel', actions) ? 'icon' : 'default'}
			>
				<Icon />
				{#if !actionSmall('cancel', actions)}
					{actionLabel('cancel', actions)}
				{/if}
			</Button>
		</span>
	{/if}
	{#if onsettings}
		<Separator orientation="vertical" class="my-2" />
		<span use:tooltip={'Settings'}>
			<Button variant="secondary" size="icon" title="Settings" onclick={onsettings}>
				<SettingsIcon />
			</Button>
		</span>
	{/if}
</div>

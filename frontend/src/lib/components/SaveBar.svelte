<script lang="ts">
	import { cn } from '$lib/utils';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import { Settings as SettingsIcon } from '@lucide/svelte';
	import {
		actionLabel,
		saveActionIds,
		saveIcons,
		type SaveActionId,
		type SaveActionSetting
	} from '$lib/settings.svelte';

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
		{const Icon = saveIcons[actions[id].icon]}
		<Button variant="secondary" title={actionLabel(id, actions)} onclick={() => onaction?.(id)}>
			<Icon />
			{actionLabel(id, actions)}
		</Button>
	{/each}
	{#if showCancel}
		{#if saves.length > 0}
			<Separator orientation="vertical" class="my-2" />
		{/if}
		{const Icon = saveIcons[actions.cancel.icon]}
		<Button variant="secondary" title={actionLabel('cancel', actions)} onclick={() => onaction?.('cancel')}>
			<Icon />
			{actionLabel('cancel', actions)}
		</Button>
	{/if}
	{#if onsettings}
		<Separator orientation="vertical" class="my-2" />
		<Button variant="secondary" size="icon" title="Settings" onclick={onsettings}>
			<SettingsIcon />
		</Button>
	{/if}
</div>

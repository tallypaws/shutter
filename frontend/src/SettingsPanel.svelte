<script lang="ts">
	import { Quit } from '$lib/wailsjs/runtime/runtime';
	import { WindowMinimise } from '$lib/wailsjs/runtime/runtime';
	import { FolderSearchIcon, Minus, X } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Separator } from '$lib/components/ui/separator';
	import * as Select from '$lib/components/ui/select/index.js';
	import SaveBar from '$lib/components/SaveBar.svelte';
	import OptionFields from './OptionFields.svelte';
	import SettingsPreview from './SettingsPreview.svelte';
	import { toolDefinitions, toolOrder } from '$lib/tools/registry';
	import type { ToolId } from '$lib/tools/types';
	import {
		actionLabel,
		defaultSettings,
		saveActionIds,
		saveActionMeta,
		saveIconLabels,
		saveIcons,
		settings,
		storeSettings,
		type SaveActionId,
		type Settings
	} from '$lib/settings.svelte';
	import { PickFolderPath } from '$lib/wailsjs/go/main/ScreenshotService';
	import { fade, fly } from 'svelte/transition';

	let { onclose, open = true }: { onclose?: () => void; open?: boolean } = $props();

	const standalone = $derived(!onclose);

	const toolIds = toolOrder.filter(
		(id) => toolDefinitions[id].optionFields?.length && toolDefinitions[id].defaultOptions
	);
	const iconItems = Object.keys(saveIcons).map((value) => ({
		value,
		label: saveIconLabels[value]
	}));

	let draft = $state<Settings>($state.snapshot(settings.data) as Settings);
	let section = $state<'defaults' | 'save'>('defaults');
	let tool = $state<ToolId>(toolIds[0]);
	let saving = $state(false);
	let message = $state('');

	const fields = $derived(toolDefinitions[tool].optionFields ?? []);
	const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(settings.data));
	const visibleSaves = $derived(
		saveActionIds.filter((id) => id !== 'cancel' && draft.saveActions[id].visible)
	);

	const getOption = (key: string) => draft.tools[tool]?.[key];
	const setOption = (key: string, value: unknown) => {
		draft.tools[tool] = { ...draft.tools[tool], [key]: value };
	};

	function resetTool() {
		draft.tools[tool] = { ...toolDefinitions[tool].defaultOptions };
	}

	function resetAll() {
		draft = defaultSettings();
	}

	function placeholder(id: SaveActionId) {
		return actionLabel(id, {
			...draft.saveActions,
			[id]: { ...draft.saveActions[id], label: '' }
		});
	}

	function locked(id: SaveActionId) {
		return id !== 'cancel' && draft.saveActions[id].visible && visibleSaves.length === 1;
	}

	async function save() {
		saving = true;
		message = '';
		try {
			await storeSettings($state.snapshot(draft) as Settings);
			if (onclose) onclose();
			else message = 'Settings saved';
		} catch (err) {
			console.error('save settings failed', err);
			message = 'Could not save settings';
		} finally {
			saving = false;
		}
	}
</script>

{#if open}
	<div
		transition:fade={{ duration: 200 }}
		class={cn(
			'select-text',
			standalone
				? 'fixed inset-0 p-0.5'
				: 'fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6'
		)}
	>
		<div
			transition:fly={{ y: 12, duration: 200 }}
			class={cn(
				'flex flex-col overflow-hidden bg-popover text-popover-foreground',
				standalone
					? 'h-full w-full outline rounded-4xl'
					: 'max-h-full w-190 max-w-full rounded-2xl outline'
			)}
		>
			<div
				class={cn(
					'flex items-center gap-2 py-1 pl-4',
					standalone ? 'pr-3 select-none [--wails-draggable:drag]' : 'pr-4'
				)}
			>
				<div class="text-sm font-medium">Settings</div>
				<div class={cn('ml-4 flex gap-1', standalone && '[--wails-draggable:no-drag]')}>
					<Button
						size="sm"
						variant={section === 'defaults' ? 'default' : 'secondary'}
						onclick={() => (section = 'defaults')}
					>
						Tool defaults
					</Button>
					<Button
						size="sm"
						variant={section === 'save' ? 'default' : 'secondary'}
						onclick={() => (section = 'save')}
					>
						Save options
					</Button>
				</div>
				{#if standalone}
					<div class="ml-auto flex items-center gap-1 [--wails-draggable:no-drag]">
						<Button
							size="icon-sm"
							variant="ghost"
							title="Minimize"
							aria-label="Minimize"
							onclick={() => void WindowMinimise()}
						>
							<Minus />
						</Button>
						<Button
							size="icon-sm"
							variant="ghost"
							title="Close"
							aria-label="Close"
							class="hover:bg-destructive/15 hover:text-destructive"
							onclick={() => void Quit()}
						>
							<X />
						</Button>
					</div>
				{/if}
			</div>
			<Separator />

			<div class="min-h-0 flex-1 overflow-y-auto p-4">
				{#if section === 'defaults'}
					<div class="flex gap-4">
						<div class="flex w-36 shrink-0 flex-col gap-1">
							{#each toolIds as id (id)}
								{const def = toolDefinitions[id]}
								<Button
									size="sm"
									class="justify-start"
									variant={tool === id ? 'default' : 'ghost'}
									onclick={() => (tool = id)}
								>
									<def.icon />
									{def.label}
								</Button>
							{/each}
						</div>
						<div class="flex min-w-0 flex-1 flex-col gap-4">
							<div class="flex flex-wrap items-center gap-3 rounded-xl px-2 py-2">
								<OptionFields {fields} get={getOption} set={setOption} />
							</div>
							<SettingsPreview {tool} options={draft.tools[tool] ?? {}} />
							<div>
								<Button size="sm" variant="secondary" onclick={resetTool}
									>Reset {toolDefinitions[tool].label}</Button
								>
							</div>
						</div>
					</div>
				{:else}
					<div class="flex flex-col gap-4">
						<div class="flex justify-center rounded-xl py-1">
							<SaveBar actions={draft.saveActions} inert />
						</div>
						<label class="flex items-center gap-2 text-sm">
							<Checkbox
								checked={draft.closeAfterSave}
								onCheckedChange={(v) => (draft.closeAfterSave = !!v)}
							/>
							Close after saving or copying
						</label>
						<div class="flex flex-col gap-1">
							{#each saveActionIds as id, index (id)}
								{const Icon = $derived(saveIcons[draft.saveActions[id].icon])}

								{#if index !== 0}
									<div class="px-6">
										<Separator class="" />
									</div>
								{/if}

								<div class="flex items-center gap-3 rounded-xl px-3 py-2">
									<Checkbox
										checked={draft.saveActions[id].visible}
										disabled={locked(id)}
										onCheckedChange={(v) => (draft.saveActions[id].visible = !!v)}
									/>
									<div class="w-36 text-sm">{saveActionMeta[id].name}</div>
									<Checkbox
										checked={!draft.saveActions[id].smallBtn}
										onCheckedChange={(v) => (draft.saveActions[id].smallBtn = !v)}
									/>
									<Input
										class="h-8 w-44"
										maxlength={32}
										placeholder={placeholder(id)}
										bind:value={draft.saveActions[id].label}
									/>
									<Icon class="size-4 shrink-0" />
									<Select.Root
										type="single"
										items={iconItems}
										bind:value={
											() => draft.saveActions[id].icon, (v) => (draft.saveActions[id].icon = v)
										}
									>
										<Select.Trigger class="w-44">
											{saveIconLabels[draft.saveActions[id].icon]}
										</Select.Trigger>
										<Select.Content class="max-h-72">
											{#each iconItems as item (item.value)}
												{const ItemIcon = $derived(saveIcons[item.value])}
												<Select.Item value={item.value} label={item.label}>
													<ItemIcon class="size-4" />
													{item.label}
												</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								</div>
							{/each}
						</div>
						<div class="flex flex-row items-center gap-2">
							<span class="whitespace-nowrap shrink-0">Save Location</span>
							<Input class="shrink" bind:value={draft.saveDir} />
							<Button
								onclick={async () => {
									const newDir = await PickFolderPath(draft.saveDir);
									if (newDir) draft.saveDir = newDir;
								}}
								size="icon"
							>
								<FolderSearchIcon />
							</Button>
						</div>
					</div>
				{/if}
			</div>

			<Separator />
			<div class="flex items-center gap-2 px-4 py-3">
				<Button size="sm" variant="secondary" onclick={resetAll}>Reset all</Button>
				<div class="text-xs text-muted-foreground">{message}</div>
				<div class="ml-auto flex gap-2">
					{#if onclose}
						<Button size="sm" variant="secondary" onclick={onclose}>Cancel</Button>
					{/if}
					<Button size="sm" disabled={saving || !dirty} onclick={save}>Save</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

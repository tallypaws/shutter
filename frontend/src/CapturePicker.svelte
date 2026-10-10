<script lang="ts">
	import {
		Check,
		CircleAlert,
		Copy,
		LoaderCircle,
		RefreshCw,
		TriangleAlert,
		Wrench
	} from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { capture, testCapture, type CaptureMethod } from '$lib/capture.svelte';
	import { BrowserOpenURL, ClipboardSetText } from '$lib/wailsjs/runtime/runtime';
	import Dialog from '$lib/components/ui/dialog/dialog.svelte';
	import { DialogContent } from '$lib/components/ui/dialog';
	import DialogTitle from '$lib/components/ui/dialog/dialog-title.svelte';
	import { Separator } from '$lib/components/ui/separator';

	let { value = $bindable('') }: { value?: string } = $props();

	let fixOpen = $state<string | null>(null);
	let copied = $state(false);

	const usable = (m: CaptureMethod) => m.status.state === 'ready';

	async function copy(text: string) {
		await ClipboardSetText(text);
		copied = true;
		setTimeout(() => (copied = false), 1200);
	}
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center gap-2">
		<div class="text-sm text-muted-foreground">
			{#if capture.testing}
				Testing...
			{/if}
		</div>
		<Button
			size="sm"
			variant="secondary"
			class="ml-auto"
			disabled={capture.testing}
			onclick={() => void testCapture()}
		>
			{#if capture.testing}
				<LoaderCircle class="animate-spin" />
			{:else}
				<RefreshCw />
			{/if}
			Test again
		</Button>
	</div>

	{#if capture.error}
		<div class="text-sm text-destructive">{capture.error}</div>
	{/if}

	<div class="flex flex-col gap-2" role="radiogroup" aria-label="Screenshot method">
		{#each capture.methods as method (method.id)}
			{@const ok = usable(method)}
			{@const chosen = value === method.id}
			<div
				class={cn(
					'flex flex-col rounded-2xl border transition-colors',
					chosen ? 'border-primary bg-primary/5' : 'border-border'
				)}
			>
				<div class="flex items-center gap-3 px-3 py-2.5">
					<button
						type="button"
						role="radio"
						aria-checked={chosen}
						disabled={!ok}
						class={cn(
							'flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
							ok ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
						)}
						onclick={() => (value = method.id)}
					>
						<span
							class={cn(
								'flex size-4 shrink-0 items-center justify-center rounded-full border',
								chosen ? 'border-primary' : 'border-muted-foreground/50'
							)}
						>
							{#if chosen}
								<span class="size-2 rounded-full bg-primary"></span>
							{/if}
						</span>
						<span class="flex min-w-0 flex-col">
							<span class="text-sm font-medium">{method.name}</span>
							<span class="text-xs text-muted-foreground">{method.description}</span>
						</span>
					</button>

					{#if method.status.state === 'ready'}
						<Badge variant="secondary">
							<Check />{method.status.ms ? `${method.status.ms} ms` : ''}
						</Badge>
					{:else if method.status.state === 'missing'}
						<Badge variant="outline">
							<CircleAlert />
							Missing dependency
						</Badge>
					{:else if method.status.state === 'failed'}
						<Badge variant="destructive">
							<TriangleAlert />
							Not working
						</Badge>
					{:else}
						<Badge variant="outline">{capture.testing ? 'Testing...' : 'Not tested'}</Badge>
					{/if}

					{#if method.status.fix}
						<Button
							size="sm"
							variant="outline"
							aria-expanded={fixOpen === method.id}
							onclick={() => (fixOpen = fixOpen === method.id ? null : method.id)}
						>
							<Wrench />
							Resolve
						</Button>
					{/if}
				</div>

				{#if method.status.reason && !ok}
					<div class="px-3 pb-2.5 pl-10 text-xs text-muted-foreground">
						{method.status.reason}
					</div>
				{/if}
			</div>
		{/each}

		{#if capture.methods.length === 0 && !capture.testing}
			<div class="text-sm text-muted-foreground">No screenshot methods are available</div>
		{/if}
	</div>
</div>

<Dialog bind:open={() => !!fixOpen, (v) => (fixOpen = null)}>
	<DialogContent>
		{const method = $derived(capture.methods.find((m) => fixOpen === m.id))}
		<DialogTitle>{method?.name}</DialogTitle>
		<Separator/>
		{#if method && method.status.fix && fixOpen === method.id}
			{@const fix = method.status.fix}
			<div>{fix.text}</div>
			{#if fix.command}
				<div class="flex items-center gap-2">
					<code
						class="min-w-0 flex-1 rounded-lg bg-background px-2 py-1 font-mono text-xs break-all"
					>
						{fix.command}
					</code>
					<Button
						size="icon-sm"
						variant="ghost"
						title="Copy command"
						aria-label="Copy command"
						onclick={() => void copy(fix.command!)}
					>
						{#if copied}<Check />{:else}<Copy />{/if}
					</Button>
				</div>
			{/if}
			{#if fix.url}
				<div>
					<Button
						size="sm"
						variant="link"
						class="h-auto p-0"
						onclick={() => BrowserOpenURL(fix.url!)}
					>
						{fix.url}
					</Button>
				</div>
			{/if}
		{/if}
	</DialogContent>
</Dialog>

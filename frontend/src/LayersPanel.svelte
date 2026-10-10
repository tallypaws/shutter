<script lang="ts">
	import { fly } from 'svelte/transition';
	import { GripVertical, X } from '@lucide/svelte';
	import { clamp } from '@tally.paws/toolbox';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';
	import { elementToolId, toolDefinitions } from '$lib/tools/registry';
	import type { AnyElement } from '$lib/tools/types';
	import { tooltip } from './tooltip.svelte';

	let {
		elements,
		selectedId = null,
		open = $bindable(false),
		dimmed = false,
		onselect,
		onreorder
	}: {
		elements: AnyElement[];
		selectedId?: string | null;
		open?: boolean;
		dimmed?: boolean;
		onselect?: (id: string) => void;
		onreorder?: (ids: string[]) => void;
	} = $props();

	const rowHeight = 32;
	const dragThreshold = 4;
	const minWidth = 200;
	const minHeight = 120;
	const edgeInset = 16;

	type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
	type Frame = { x: number; y: number; width: number; height: number };
	type Gesture = {
		kind: 'move' | Edge;
		pointerId: number;
		startX: number;
		startY: number;
		origin: Frame;
	};

	let frame = $state<Frame>({ x: edgeInset, y: edgeInset, width: 240, height: 300 });
	let gesture = $state<Gesture | null>(null);
	let placed = false;
	let windowEl = $state<HTMLDivElement>();
	let listEl = $state<HTMLDivElement>();

	const resizeHandles: { edge: Edge; class: string }[] = [
		{ edge: 'n', class: 'inset-x-3 top-0 h-1.5 cursor-n-resize' },
		{ edge: 's', class: 'inset-x-3 bottom-0 h-1.5 cursor-s-resize' },
		{ edge: 'w', class: 'inset-y-3 left-0 w-1.5 cursor-w-resize' },
		{ edge: 'e', class: 'inset-y-3 right-0 w-1.5 cursor-e-resize' },
		{ edge: 'nw', class: 'top-0 left-0 size-3 cursor-nw-resize' },
		{ edge: 'ne', class: 'top-0 right-0 size-3 cursor-ne-resize' },
		{ edge: 'sw', class: 'bottom-0 left-0 size-3 cursor-sw-resize' },
		{ edge: 'se', class: 'right-0 bottom-0 size-3 cursor-se-resize' }
	];

	function bounds() {
		const parent = windowEl?.offsetParent;
		return {
			width: parent?.clientWidth ?? window.innerWidth,
			height: parent?.clientHeight ?? window.innerHeight
		};
	}

	function fit() {
		const b = bounds();
		const width = clamp(frame.width, Math.min(minWidth, b.width), b.width);
		const height = clamp(frame.height, Math.min(minHeight, b.height), b.height);
		frame = {
			width,
			height,
			x: clamp(frame.x, 0, b.width - width),
			y: clamp(frame.y, 0, b.height - height)
		};
	}

	function place(node: HTMLDivElement) {
		if (placed) {
			fit();
			return;
		}
		placed = true;
		const b = bounds();
		frame.x = edgeInset;
		frame.y = b.height - frame.height - edgeInset;
		fit();
	}

	function beginGesture(event: PointerEvent, kind: Gesture['kind']) {
		if (event.button !== 0) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		gesture = {
			kind,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			origin: { ...frame }
		};
	}

	function moveGesture(event: PointerEvent) {
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		const { kind, origin } = gesture;
		const dx = event.clientX - gesture.startX;
		const dy = event.clientY - gesture.startY;
		const b = bounds();

		if (kind === 'move') {
			frame.x = clamp(origin.x + dx, 0, b.width - origin.width);
			frame.y = clamp(origin.y + dy, 0, b.height - origin.height);
			return;
		}

		let { x, y, width, height } = origin;
		if (kind.includes('e')) width = clamp(origin.width + dx, minWidth, b.width - origin.x);
		if (kind.includes('s')) height = clamp(origin.height + dy, minHeight, b.height - origin.y);
		if (kind.includes('w')) {
			const right = origin.x + origin.width;
			x = clamp(origin.x + dx, 0, right - minWidth);
			width = right - x;
		}
		if (kind.includes('n')) {
			const bottom = origin.y + origin.height;
			y = clamp(origin.y + dy, 0, bottom - minHeight);
			height = bottom - y;
		}
		frame = { x, y, width, height };
	}

	function endGesture(event: PointerEvent) {
		if (gesture?.pointerId === event.pointerId) gesture = null;
	}

	type Drag = {
		id: string;
		pointerId: number;
		from: number;
		to: number;
		startY: number;
		startScroll: number;
		dy: number;
		active: boolean;
	};

	let drag = $state<Drag | null>(null);

	const rows = $derived(elements.toReversed());

	const shown = $derived.by(() => {
		const ids = rows.map((el) => el.id);
		if (!drag?.active) return ids;
		ids.splice(drag.from, 1);
		ids.splice(drag.to, 0, drag.id);
		return ids;
	});

	function rowTop(id: string) {
		if (drag?.active && drag.id === id) return drag.from * rowHeight + drag.dy;
		return shown.indexOf(id) * rowHeight;
	}

	function labelFor(el: AnyElement) {
		if (el.type === 'text') return el.text.split('\n')[0].trim() || 'Text';
		return toolDefinitions[elementToolId(el)].label;
	}

	function colorFor(el: AnyElement): string | undefined {
		let color: string | undefined;
		switch (el.type) {
			case 'rect':
			case 'circle':
				color = el.fill ? el.fillColor : el.outline ? el.outlineColor : undefined;
				break;
			case 'line':
			case 'arrow':
			case 'draw':
			case 'text':
				color = el.color;
				break;
		}
		return color && color !== 'transparent' ? color : undefined;
	}

	function handleRowDown(event: PointerEvent, id: string, index: number) {
		if (event.button !== 0) return;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drag = {
			id,
			pointerId: event.pointerId,
			from: index,
			to: index,
			startY: event.clientY,
			startScroll: listEl?.scrollTop ?? 0,
			dy: 0,
			active: false
		};
	}

	function handleRowMove(event: PointerEvent) {
		if (!drag || drag.pointerId !== event.pointerId) return;
		const dy = event.clientY - drag.startY + ((listEl?.scrollTop ?? 0) - drag.startScroll);
		if (!drag.active && Math.abs(dy) < dragThreshold) return;

		const top = clamp(drag.from * rowHeight + dy, 0, (rows.length - 1) * rowHeight);
		drag.active = true;
		drag.dy = top - drag.from * rowHeight;
		drag.to = Math.round(top / rowHeight);
	}

	function handleRowUp(event: PointerEvent) {
		if (!drag || drag.pointerId !== event.pointerId) return;
		const { id, from, to, active } = drag;
		drag = null;

		if (!active) {
			onselect?.(id);
			return;
		}
		if (from === to) return;

		const ids = rows.map((el) => el.id);
		ids.splice(from, 1);
		ids.splice(to, 0, id);
		onreorder?.(ids);
	}

	function handleRowKeyDown(event: KeyboardEvent, id: string) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		onselect?.(id);
	}
</script>

<svelte:window onresize={() => open && fit()} />

{#if open}
	<div
		bind:this={windowEl}
		use:place
		class={cn(
			'absolute z-10 flex flex-col overflow-hidden rounded-xl bg-popover outline transition-opacity',
			dimmed && 'pointer-events-none opacity-30'
		)}
		style="left: {frame.x}px; top: {frame.y}px; width: {frame.width}px; height: {frame.height}px;"
		transition:fly={{ y: 10, duration: 150 }}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class={cn(
				'flex h-9 shrink-0 touch-none items-center justify-between pr-1.5 pl-3 select-none',
				gesture?.kind === 'move' ? 'cursor-grabbing' : 'cursor-grab'
			)}
			onpointerdown={(event) => beginGesture(event, 'move')}
			onpointermove={moveGesture}
			onpointerup={endGesture}
			onpointercancel={endGesture}
		>
			<span class="flex items-center gap-2 text-sm font-medium">
				<span title="Top of the list is drawn in front">Layers</span>
				{#if rows.length > 0}
					<Badge variant="secondary">{rows.length}</Badge>
				{/if}
			</span>
			<span use:tooltip={'Close'} onpointerdown={(event) => event.stopPropagation()}>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Close layers"
					onclick={() => (open = false)}
				>
					<X />
				</Button>
			</span>
		</div>

		{#if rows.length === 0}
			<p class="px-3 pb-3 text-xs text-muted-foreground">Start doing stuff</p>
		{:else}
			<div bind:this={listEl} class="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
				<div class="relative" style="height: {rows.length * rowHeight}px">
					{#each rows as el, i (el.id)}
						{const Icon = $derived(toolDefinitions[elementToolId(el)].icon)}
						{const color = $derived(colorFor(el))}
						{const dragging = $derived(drag?.active && drag.id === el.id)}
						<div
							role="button"
							tabindex="0"
							aria-pressed={selectedId === el.id}
							class={cn(
								'absolute inset-x-0 flex h-8 touch-none items-center gap-1.5 rounded-md px-1 text-sm select-none',
								selectedId === el.id ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
								dragging ? 'z-10 cursor-grabbing outline' : 'cursor-pointer'
							)}
							style="transform: translateY({rowTop(el.id)}px); transition: {dragging
								? 'none'
								: 'transform 150ms ease-out'};"
							onpointerdown={(event) => handleRowDown(event, el.id, i)}
							onpointermove={handleRowMove}
							onpointerup={handleRowUp}
							onpointercancel={() => (drag = null)}
							onkeydown={(event) => handleRowKeyDown(event, el.id)}
						>
							<GripVertical class="size-3.5 shrink-0 opacity-40" />
							<span class="flex size-6 shrink-0 items-center justify-center rounded-md">
								<Icon class="size-4" style={color ? `color: ${color}` : undefined} />
							</span>
							<span class="truncate">{labelFor(el)}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#each resizeHandles as handle (handle.edge)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class={cn('absolute z-20 touch-none', handle.class)}
				onpointerdown={(event) => beginGesture(event, handle.edge)}
				onpointermove={moveGesture}
				onpointerup={endGesture}
				onpointercancel={endGesture}
			></div>
		{/each}
	</div>
{/if}

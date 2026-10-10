<script lang="ts">
	import {
		createElement,
		finishElement,
		getElementHandles,
		resizeElement,
		updateElementEnd
	} from '$lib/tools/elements';
	import { ensureFonts, getSceneContext, renderScene } from '$lib/render/scene';
	import { fontEpoch } from '$lib/fontEpoch.svelte';
	import type { AnyElement, ToolId } from '$lib/tools/types';

	let {
		tool,
		options,
		onchange
	}: {
		tool: ToolId;
		options: Record<string, unknown>;
		onchange?: (patch: Record<string, unknown>) => void;
	} = $props();

	const W = 360;
	const H = 170;
	const mods = { shift: false, alt: false, ctrl: false };

	let canvas = $state<HTMLCanvasElement>();

	function makeBase() {
		const c = document.createElement('canvas');
		c.width = W;
		c.height = H;
		const g = c.getContext('2d')!;
		for (let y = 0; y < H; y += 20) {
			for (let x = 0; x < W; x += 20) {
				g.fillStyle = (x / 20 + y / 20) % 2 ? '#cfd6e6' : '#f7f8fc';
				g.fillRect(x, y, 20, 20);
			}
		}
		g.fillStyle = '#3b4258';
		g.font = '600 22px sans-serif';
		g.fillText('Screenshot preview', 24, 60);
		g.font = '14px sans-serif';
		g.fillText('The quick brown fox jumps over the lazy dog', 24, 100);
		g.fillText('0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ', 24, 124);
		g.font = '8px sans-serif';
		g.fillText('miauu mrowerr morrrr purrr mroaw', 24, 140);
		return c;
	}

	const base = makeBase();

	function sample(id: ToolId, o: Record<string, unknown>): AnyElement | null {
		switch (id) {
			case 'line':
			case 'arrow': {
				const el = createElement(id, { x: 50, y: 130 }, o);
				return el && updateElementEnd(el, { x: 310, y: 40 });
			}
			case 'rect': {
				const el = createElement(id, { x: 70, y: 35 }, o);
				return el && finishElement(updateElementEnd(el, { x: 290, y: 135 }));
			}
			case 'circle': {
				const origin = { x: 70, y: 35 };
				const el = createElement(id, origin, o);
				return el && updateElementEnd(el, { x: 290, y: 135 }, mods, origin);
			}
			case 'pen':
			case 'highlighter': {
				let el = createElement(id, { x: 40, y: 100 }, o);
				if (!el) return null;
				let i = 1;
				for (; i <= 20; i += 1) {
					el = updateElementEnd(el, { x: 40 + i * 7, y: 85 + Math.sin(i / 3.5) * 38 });
				}
				for (; i <= 50; i += 4) {
					el = updateElementEnd(el, { x: 40 + i * 7, y: 85 + Math.sin(i / 3.5) * 38 });
				}
				return el;
			}
			case 'text': {
				const el = createElement(id, { x: 40, y: 60 }, o);
				return el?.type === 'text' ? { ...el, text: 'Sample text' } : el;
			}
			case 'blur':
			case 'pixelate': {
				const el = createElement(id, { x: 100, y: 30 }, o);
				return el && finishElement(updateElementEnd(el, { x: 270, y: 140 }));
			}
			default:
				return null;
		}
	}

	const arrow = $derived(
		tool === 'arrow' ? (sample('arrow', $state.snapshot(options)) as AnyElement | null) : null
	);
	const arrowHandles = $derived(
		arrow ? getElementHandles(arrow).filter((h) => h.id === 'head' || h.id === 'tail') : []
	);

	let draggingHandle = $state<string | null>(null);

	function dragHandle(event: PointerEvent, id: string) {
		if (!arrow || !canvas) return;
		event.preventDefault();
		const target = event.currentTarget as HTMLElement;
		target.setPointerCapture(event.pointerId);
		draggingHandle = id;
	}

	function moveHandle(event: PointerEvent, id: string) {
		if (draggingHandle !== id || !arrow || !canvas) return;
		const rect = canvas.getBoundingClientRect();
		const point = {
			x: ((event.clientX - rect.left) / rect.width) * W,
			y: ((event.clientY - rect.top) / rect.height) * H
		};
		const next = resizeElement(arrow, id, point, {
			shift: event.shiftKey,
			alt: event.altKey,
			ctrl: event.ctrlKey
		});
		if (next.type !== 'arrow') return;
		const round = (n: number) => Math.round(n * 10) / 10;
		const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
		const fold = (deg: number) => Math.abs(((((deg + 180) % 360) + 360) % 360) - 180);
		onchange?.(
			id === 'head'
				? {
						headlen: clamp(round(next.headlen), 0, 500),
						headangle: clamp(round(fold(next.headangle)), 0, 180)
					}
				: {
						taillen: clamp(round(next.taillen), 0, 500),
						tailangle: clamp(round(fold(next.tailangle)), 0, 180)
					}
		);
	}

	function releaseHandle(event: PointerEvent) {
		(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
		draggingHandle = null;
	}

	$effect(() => {
		const c = canvas;
		if (!c) return;
		void fontEpoch.n;
		const el = sample(tool, $state.snapshot(options));
		renderScene(getSceneContext(c), base, W, H, el ? [el] : []);
		if (el) {
			ensureFonts([el]).then((loaded) => {
				if (loaded) fontEpoch.n++;
			});
		}
	});
</script>

<div class="relative" style="width: {W}px; height: {H}px">
	<canvas
		bind:this={canvas}
		width={W}
		height={H}
		class="rounded-lg outline"
		style="width: {W}px; height: {H}px"
	></canvas>
	{#each arrowHandles as handle (handle.id)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			title={handle.id === 'head'
				? 'Drag to set head length and angle'
				: 'Drag to set tail length and angle'}
			class="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full bg-white outline-2 outline-primary active:cursor-grabbing"
			style="left: {handle.x}px; top: {handle.y}px"
			onpointerdown={(e) => dragHandle(e, handle.id)}
			onpointermove={(e) => moveHandle(e, handle.id)}
			onpointerup={releaseHandle}
			onpointercancel={releaseHandle}
		></div>
	{/each}
</div>

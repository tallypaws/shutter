<script lang="ts">
	import { createElement, finishElement, updateElementEnd } from '$lib/tools/elements';
	import { ensureFonts, getSceneContext, renderScene } from '$lib/render/scene';
	import { fontEpoch } from '$lib/fontEpoch.svelte';
	import type { AnyElement, ToolId } from '$lib/tools/types';

	let { tool, options }: { tool: ToolId; options: Record<string, unknown> } = $props();

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
			case 'pen': {
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

<canvas
	bind:this={canvas}
	width={W}
	height={H}
	class="rounded-lg outline"
	style="width: {W}px; height: {H}px"
></canvas>
